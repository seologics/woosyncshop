/**
 * POST /api/reactivate-subscription
 * Superadmin-only: reinstates a cancelled subscription for a user.
 * - Clears pending_downgrade_plan
 * - Creates a new Mollie subscription starting today + 1 period
 * - Sends the user a "subscription reinstated" email
 */
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const MOLLIE_API = 'https://api.mollie.com/v2'
const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'
const PLAN_NAMES  = { starter: 'Starter', growth: 'Growth', pro: 'Pro', free_forever: 'Free Forever' }
const PLAN_PRICES = {
  starter: { monthly: '7.99',  annual_mo: '7.19' },
  growth:  { monthly: '11.99', annual_mo: '10.79' },
  pro:     { monthly: '19.99', annual_mo: '17.99' },
}
const PLAN_LIMITS = {
  starter: { max_shops: 2,  max_connected_products: 500 },
  growth:  { max_shops: 5,  max_connected_products: 2000 },
  pro:     { max_shops: 10, max_connected_products: 10000 },
}

async function molliePost(apiKey, path, body) {
  const res = await fetch(`${MOLLIE_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function mollieDelete(apiKey, path) {
  await fetch(`${MOLLIE_API}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  // Auth — superadmin only
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { data: { user: admin }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !admin || admin.email !== SUPERADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { user_id } = await req.json()
    if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // Load profile
    const { data: profile } = await supabase.from('user_profiles')
      .select('plan, billing_period, billing_cycle_start, mollie_customer_id, mollie_subscription_id, full_name, chosen_plan')
      .eq('id', user_id).single()

    if (!profile) return new Response(JSON.stringify({ error: 'Gebruiker niet gevonden' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    const plan = ['starter', 'growth', 'pro'].includes(profile.plan) ? profile.plan : (profile.chosen_plan || 'growth')
    const billingPeriod = profile.billing_period || 'monthly'
    const now = new Date()
    const nowIso = now.toISOString()

    // Get email from auth
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(user_id)
    const email = authUser?.email
    const firstName = (profile.full_name || email || '').split(' ')[0]

    const { data: settings } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
    const mollieKey = settings?.mollie_api_key

    // Create new Mollie subscription if we have a customer + key
    let newSubId = null
    if (mollieKey && profile.mollie_customer_id) {
      // Cancel any stale subscription first
      if (profile.mollie_subscription_id) {
        try { await mollieDelete(mollieKey, `/customers/${profile.mollie_customer_id}/subscriptions/${profile.mollie_subscription_id}`) } catch {}
      }

      const priceKey = billingPeriod === 'annual' ? 'annual_mo' : 'monthly'
      const basePrice = parseFloat(PLAN_PRICES[plan]?.[priceKey] || '11.99')
      const chargeAmount = billingPeriod === 'annual' ? (basePrice * 12).toFixed(2) : basePrice.toFixed(2)
      const interval = billingPeriod === 'annual' ? '1 years' : '1 months'
      const billingLabel = billingPeriod === 'annual' ? 'jaarabonnement' : 'maandabonnement'

      // Next billing = today + 1 period
      const nextBilling = new Date(now)
      billingPeriod === 'annual' ? nextBilling.setFullYear(nextBilling.getFullYear() + 1) : nextBilling.setMonth(nextBilling.getMonth() + 1)
      const startDate = nextBilling.toISOString().slice(0, 10)

      const sub = await molliePost(mollieKey, `/customers/${profile.mollie_customer_id}/subscriptions`, {
        amount: { currency: 'EUR', value: chargeAmount },
        interval,
        description: `WooSyncShop ${PLAN_NAMES[plan]} – ${billingLabel}`,
        webhookUrl: 'https://woosyncshop.com/api/mollie-webhook',
        startDate,
        metadata: { supabase_user_id: user_id, plan, billing_period: billingPeriod },
      })
      if (sub.id) newSubId = sub.id
    }

    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.growth

    // Update profile — clear cancellation, restore plan limits
    await supabase.from('user_profiles').update({
      plan,
      chosen_plan: plan,
      billing_cycle_start: nowIso,
      pending_downgrade_plan: null,
      pending_downgrade_billing_period: null,
      max_shops: limits.max_shops,
      max_connected_products: limits.max_connected_products,
      ...(newSubId ? { mollie_subscription_id: newSubId } : {}),
    }).eq('id', user_id)

    // Log history
    await supabase.from('user_plan_history').insert({
      user_id,
      event_type: 'activated',
      from_plan: 'cancelled',
      to_plan: plan,
      billing_period: billingPeriod,
      notes: `Heractivering door superadmin${newSubId ? ` — nieuw abonnement ${newSubId}` : ''}`,
    })

    await supabase.from('system_logs').insert({
      level: 'info', function_name: 'reactivate-subscription',
      message: `Subscription reactivated for user ${user_id} by superadmin (${plan} ${billingPeriod})`,
      metadata: { user_id, plan, new_subscription_id: newSubId },
    })

    // Send reinstatement email
    if (email) {
      try {
        const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
        const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
        const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`
        const transporter = nodemailer.createTransport({
          host: smtpHost, port: 465, secure: true,
          auth: { user: smtpUser, pass: smtpPass },
        })

        const priceKey = billingPeriod === 'annual' ? 'annual_mo' : 'monthly'
        const price = PLAN_PRICES[plan]?.[priceKey] || '11.99'
        const billingLabel = billingPeriod === 'annual' ? 'jaarabonnement' : 'maandabonnement'
        const nextBillingDate = new Date(now)
        billingPeriod === 'annual' ? nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1) : nextBillingDate.setMonth(nextBillingDate.getMonth() + 1)
        const nextBillingFormatted = nextBillingDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

        await transporter.sendMail({
          from: '"WooSyncShop" <info@woosyncshop.com>',
          to: email,
          subject: `Je WooSyncShop ${PLAN_NAMES[plan]} abonnement is heractiveerd ✅`,
          html: `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2d3056">

        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px">WooSync<span style="color:#c4b5fd">Shop</span></div>
          <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:6px">Multi-shop WooCommerce beheer</div>
        </td></tr>

        <tr><td style="padding:36px 40px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#f1f5f9">Hoi ${firstName}! 🎉</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">
            Je <strong style="color:#c4b5fd">WooSyncShop ${PLAN_NAMES[plan]}</strong> abonnement is heractiveerd.
            Je hebt direct weer volledige toegang tot alle functies.
          </p>

          <div style="background:#0f1117;border:1px solid #2d3056;border-radius:8px;padding:16px 20px;margin:0 0 24px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#94a3b8">Pakket</td>
                <td style="font-size:13px;font-weight:700;color:#f1f5f9;text-align:right">WooSyncShop ${PLAN_NAMES[plan]}</td>
              </tr>
              <tr><td style="padding:4px 0" colspan="2"></td></tr>
              <tr>
                <td style="font-size:13px;color:#94a3b8">Facturering</td>
                <td style="font-size:13px;color:#e2e8f0;text-align:right">${billingLabel}</td>
              </tr>
              <tr><td style="padding:4px 0" colspan="2"></td></tr>
              <tr>
                <td style="font-size:13px;color:#94a3b8">Bedrag</td>
                <td style="font-size:15px;font-weight:800;color:#c4b5fd;text-align:right">€${price} / maand</td>
              </tr>
              <tr><td style="padding:4px 0" colspan="2"></td></tr>
              <tr>
                <td style="font-size:13px;color:#94a3b8">Volgende betaling</td>
                <td style="font-size:13px;color:#e2e8f0;text-align:right">${nextBillingFormatted}</td>
              </tr>
            </table>
          </div>

          <div style="text-align:center;margin:0 0 8px">
            <a href="https://woosyncshop.com/#settings"
               style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">
              Naar mijn account →
            </a>
          </div>
        </td></tr>

        <tr><td style="padding:20px 40px;border-top:1px solid #2d3056;text-align:center">
          <p style="margin:0;font-size:12px;color:#4b5563">
            WooSyncShop · Webs Media · De Wittenkade 152H · 1051 AN Amsterdam<br>
            <a href="https://woosyncshop.com/contact" style="color:#6366f1;text-decoration:none">Contact</a> ·
            <a href="https://woosyncshop.com/voorwaarden" style="color:#6366f1;text-decoration:none">Voorwaarden</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
        })
      } catch (mailErr) {
        await supabase.from('system_logs').insert({
          level: 'warn', function_name: 'reactivate-subscription',
          message: `Reinstatement email failed for ${email}: ${mailErr.message}`,
        })
      }
    }

    return new Response(JSON.stringify({ ok: true, plan, new_subscription_id: newSubId }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('reactivate-subscription error:', err)
    await supabase.from('system_logs').insert({
      level: 'error', function_name: 'reactivate-subscription',
      message: `Exception: ${err.message}`,
    }).catch(() => {})
    return new Response(JSON.stringify({ error: err.message || 'Onbekende fout' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/reactivate-subscription' }
