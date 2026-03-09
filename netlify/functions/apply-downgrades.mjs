/**
 * Netlify Scheduled Function — runs daily at 02:00 UTC
 * Handles:
 *  1. Scheduled downgrades (pending_downgrade_plan set) whose billing cycle has ended
 *  2. Cancellations (pending_downgrade_plan = 'cancelled') whose billing cycle has ended
 */

import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const MOLLIE_API = 'https://api.mollie.com/v2'

const PLAN_PRICES = {
  starter: { monthly: '7.99',  annual_mo: '7.19' },
  growth:  { monthly: '11.99', annual_mo: '10.79' },
  pro:     { monthly: '19.99', annual_mo: '17.99' },
}
const PLAN_NAMES = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }

async function molliePost(apiKey, path, body) {
  const res = await fetch(`${MOLLIE_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function mollieDelete(apiKey, path) {
  try {
    await fetch(`${MOLLIE_API}${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  } catch {}
}

function cycleEndDate(cycleStart, billingPeriod) {
  const d = new Date(cycleStart)
  if (billingPeriod === 'annual') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d
}

async function sendDowngradeEmail(transporter, email, firstName, fromPlan, toPlan) {
  try {
    const fromName = PLAN_NAMES[fromPlan] || fromPlan
    const toName = toPlan === 'cancelled' ? 'geen (opgezegd)' : (PLAN_NAMES[toPlan] || toPlan)
    await transporter.sendMail({
      from: '"WooSyncShop" <info@woosyncshop.com>',
      to: email,
      subject: toPlan === 'cancelled'
        ? 'Je WooSyncShop abonnement is beëindigd'
        : `Je WooSyncShop abonnement is gewijzigd naar ${toName}`,
      html: `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2d3056">
    <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#fff">WooSync<span style="color:#c4b5fd">Shop</span></div>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">
        Hoi ${firstName}, je abonnement is ${toPlan === 'cancelled' ? 'beëindigd' : 'gewijzigd'} 📋
      </p>
      ${toPlan === 'cancelled'
        ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">
            Je <strong style="color:#c4b5fd">WooSyncShop ${fromName}</strong> abonnement is per vandaag beëindigd zoals je had aangegeven.
            Je account is opgeschort. Je kunt je abonnement altijd opnieuw activeren via de website.
           </p>`
        : `<p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">
            Je abonnement is zoals gepland gewijzigd van <strong style="color:#c4b5fd">${fromName}</strong> naar
            <strong style="color:#c4b5fd">${toName}</strong>. Je nieuwe limieten zijn direct van kracht.
           </p>`}
      <div style="text-align:center;margin:28px 0 8px">
        <a href="https://woosyncshop.com" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">
          ${toPlan === 'cancelled' ? 'Opnieuw activeren →' : 'Inloggen →'}
        </a>
      </div>
    </td></tr>
    <tr><td style="padding:20px 40px;border-top:1px solid #2d3056;text-align:center">
      <p style="margin:0;font-size:12px;color:#4b5563">WooSyncShop · Webs Media · De Wittenkade 152H · 1051 AN Amsterdam</p>
    </td></tr>
  </table></td></tr></table>
</body></html>`,
    })
  } catch (e) {
    console.error('apply-downgrades: email failed', e.message)
  }
}

export default async () => {
  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const now = new Date()
  let processed = 0
  let errors = 0

  try {
    const { data: settings } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
    const mollieKey = settings?.mollie_api_key

    // Setup email transporter
    const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
    const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
    const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`
    const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })

    // Find all users with a pending downgrade/cancellation
    const { data: pendingUsers, error: fetchErr } = await supabase
      .from('user_profiles')
      .select('id, plan, billing_period, billing_cycle_start, pending_downgrade_plan, pending_downgrade_billing_period, mollie_customer_id, mollie_subscription_id, full_name')
      .not('pending_downgrade_plan', 'is', null)

    if (fetchErr) throw fetchErr

    // Get auth users for emails
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()
    const emailMap = {}
    authUsers?.forEach(u => { emailMap[u.id] = u.email })

    for (const user of (pendingUsers || [])) {
      try {
        if (!user.billing_cycle_start) continue

        const cycleEnd = cycleEndDate(user.billing_cycle_start, user.billing_period || 'monthly')

        // Not yet at cycle end — skip
        if (cycleEnd > now) continue

        const fromPlan = user.plan
        const toPlan = user.pending_downgrade_plan // e.g. 'starter', 'growth', or 'cancelled'
        const newBillingPeriod = user.pending_downgrade_billing_period || user.billing_period || 'monthly'
        const userEmail = emailMap[user.id]
        const firstName = (user.full_name || userEmail || 'daar').split(' ')[0]

        // Cancel existing Mollie subscription
        if (mollieKey && user.mollie_customer_id && user.mollie_subscription_id) {
          await mollieDelete(mollieKey, `/customers/${user.mollie_customer_id}/subscriptions/${user.mollie_subscription_id}`)
        }

        if (toPlan === 'cancelled') {
          // Full cancellation — suspend the user
          await supabase.from('user_profiles').update({
            plan: 'suspended',
            mollie_subscription_id: null,
            pending_downgrade_plan: null,
            pending_downgrade_billing_period: null,
          }).eq('id', user.id)

          await supabase.from('user_plan_history').insert({
            user_id: user.id,
            event_type: 'cancelled',
            from_plan: fromPlan,
            to_plan: 'suspended',
            billing_period: user.billing_period || 'monthly',
            notes: 'Abonnement beëindigd na afloop betaalperiode (door gebruiker opgezegd)',
          })
        } else if (['starter', 'growth', 'pro'].includes(toPlan)) {
          // Downgrade to a lower paid plan — create new Mollie subscription
          const newCycleStart = now.toISOString()

          // Determine plan limits
          const PLAN_LIMITS = {
            starter: { max_shops: 2, max_connected_products: 500 },
            growth:  { max_shops: 5, max_connected_products: 2000 },
            pro:     { max_shops: 10, max_connected_products: 10000 },
          }
          const limits = PLAN_LIMITS[toPlan] || PLAN_LIMITS.growth

          await supabase.from('user_profiles').update({
            plan: toPlan,
            billing_period: newBillingPeriod,
            chosen_plan: toPlan,
            billing_cycle_start: newCycleStart,
            max_shops: limits.max_shops,
            max_connected_products: limits.max_connected_products,
            mollie_subscription_id: null,
            pending_downgrade_plan: null,
            pending_downgrade_billing_period: null,
          }).eq('id', user.id)

          await supabase.from('user_plan_history').insert({
            user_id: user.id,
            event_type: 'downgraded',
            from_plan: fromPlan,
            to_plan: toPlan,
            billing_period: newBillingPeriod,
            notes: `Downgrade toegepast na afloop betaalperiode: ${fromPlan} → ${toPlan}`,
          })

          // Create new Mollie subscription for lower plan
          if (mollieKey && user.mollie_customer_id) {
            const priceKey = newBillingPeriod === 'annual' ? 'annual_mo' : 'monthly'
            const basePrice = parseFloat(PLAN_PRICES[toPlan]?.[priceKey] || '7.99')
            const chargeAmount = newBillingPeriod === 'annual' ? (basePrice * 12).toFixed(2) : basePrice.toFixed(2)
            const interval = newBillingPeriod === 'annual' ? '1 years' : '1 months'

            const nextBilling = new Date(newCycleStart)
            newBillingPeriod === 'annual'
              ? nextBilling.setFullYear(nextBilling.getFullYear() + 1)
              : nextBilling.setMonth(nextBilling.getMonth() + 1)

            const sub = await molliePost(mollieKey, `/customers/${user.mollie_customer_id}/subscriptions`, {
              amount: { currency: 'EUR', value: chargeAmount },
              interval,
              description: `WooSyncShop ${PLAN_NAMES[toPlan] || toPlan} – ${newBillingPeriod === 'annual' ? 'jaarabonnement' : 'maandabonnement'}`,
              webhookUrl: 'https://woosyncshop.com/api/mollie-webhook',
              startDate: nextBilling.toISOString().slice(0, 10),
              metadata: { supabase_user_id: user.id, plan: toPlan, billing_period: newBillingPeriod },
            })
            if (sub.id) {
              await supabase.from('user_profiles').update({ mollie_subscription_id: sub.id }).eq('id', user.id)
            }
          }
        }

        // Send email notification
        if (userEmail) {
          await sendDowngradeEmail(transporter, userEmail, firstName, fromPlan, toPlan)
        }

        processed++
        await supabase.from('system_logs').insert({
          level: 'info', function_name: 'apply-downgrades',
          message: `Applied ${toPlan === 'cancelled' ? 'cancellation' : 'downgrade'} for user ${user.id}: ${fromPlan} → ${toPlan}`,
          metadata: { user_id: user.id, from_plan: fromPlan, to_plan: toPlan },
        })
      } catch (userErr) {
        errors++
        console.error(`apply-downgrades: error processing user ${user.id}:`, userErr.message)
        await supabase.from('system_logs').insert({
          level: 'error', function_name: 'apply-downgrades',
          message: `Failed to process downgrade for user ${user.id}: ${userErr.message}`,
          metadata: { user_id: user.id },
        })
      }
    }

    await supabase.from('system_logs').insert({
      level: 'info', function_name: 'apply-downgrades',
      message: `Scheduled run complete — ${processed} processed, ${errors} errors`,
      metadata: { processed, errors, checked: (pendingUsers || []).length },
    })

    console.log(`apply-downgrades: ${processed} processed, ${errors} errors`)
  } catch (err) {
    console.error('apply-downgrades: fatal error', err.message)
    await supabase.from('system_logs').insert({
      level: 'error', function_name: 'apply-downgrades',
      message: `Fatal error in scheduled run: ${err.message}`,
    })
  }
}

export const config = {
  schedule: '0 2 * * *',   // Daily at 02:00 UTC
}
