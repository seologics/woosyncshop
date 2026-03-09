/**
 * Scheduled: every 10 minutes
 * Finds users who:
 *   - plan = 'pending_payment'
 *   - registered_at is more than 10 minutes ago (they've had time to pay)
 *   - payment_reminder_sent_at IS NULL (never emailed)
 * Sends the "Voltooi je betaling" email once, then stamps payment_reminder_sent_at.
 */
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const PLAN_NAMES   = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }
const PLAN_PRICES  = {
  starter: { monthly: '7.99',  annual_mo: '7.19' },
  growth:  { monthly: '11.99', annual_mo: '10.79' },
  pro:     { monthly: '19.99', annual_mo: '17.99' },
}

export default async () => {
  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
  const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
  const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`
  const transporter = nodemailer.createTransport({
    host: smtpHost, port: 465, secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  })

  try {
    // Find pending users older than 10 minutes who haven't been reminded yet
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    const { data: pendingProfiles, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, chosen_plan, billing_period')
      .eq('plan', 'pending_payment')
      .is('payment_reminder_sent_at', null)
      .lt('registered_at', tenMinutesAgo)

    if (error) {
      await supabase.from('system_logs').insert({
        level: 'error', function_name: 'send-payment-reminders',
        message: `Failed to query pending users: ${error.message}`,
      })
      return
    }

    if (!pendingProfiles?.length) return // nothing to do

    await supabase.from('system_logs').insert({
      level: 'info', function_name: 'send-payment-reminders',
      message: `Found ${pendingProfiles.length} pending user(s) to remind`,
      metadata: { count: pendingProfiles.length },
    })

    for (const profile of pendingProfiles) {
      try {
        // Get email from auth
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(profile.id)
        const email = authUser?.email
        if (!email) continue

        const planKey      = profile.chosen_plan || 'growth'
        const planName     = PLAN_NAMES[planKey] || 'Growth'
        const billingPeriod = profile.billing_period || 'monthly'
        const billingLabel = billingPeriod === 'annual' ? 'jaarabonnement' : 'maandabonnement'
        const priceKey     = billingPeriod === 'annual' ? 'annual_mo' : 'monthly'
        const price        = PLAN_PRICES[planKey]?.[priceKey] || '11.99'
        const firstName    = (profile.full_name || email).split(' ')[0]

        await transporter.sendMail({
          from: '"WooSyncShop" <info@woosyncshop.com>',
          to: email,
          subject: `Je WooSyncShop ${planName} account staat klaar — voltooi je betaling`,
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
          <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">Hoi ${firstName}, je account staat klaar! 🎉</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">
            Je hebt je aangemeld voor <strong style="color:#c4b5fd">WooSyncShop ${planName}</strong>
            (${billingLabel} · €${price}/maand) maar je betaling is nog niet afgerond.
            Klik hieronder om direct toegang te krijgen.
          </p>

          <div style="background:#0f1117;border:1px solid #2d3056;border-radius:8px;padding:16px 20px;margin:0 0 24px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#94a3b8">Pakket</td>
                <td style="font-size:13px;font-weight:700;color:#f1f5f9;text-align:right">WooSyncShop ${planName}</td>
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
            </table>
          </div>

          <div style="text-align:center;margin:0 0 8px">
            <a href="https://woosyncshop.com/?pay=1"
               style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">
              Betaling afronden →
            </a>
          </div>
          <p style="margin:8px 0 0;font-size:11px;color:#4b5563;text-align:center">🔒 Veilige betaling via Mollie</p>
        </td></tr>

        <tr><td style="padding:20px 40px;border-top:1px solid #2d3056;text-align:center">
          <p style="margin:0;font-size:12px;color:#4b5563">
            WooSyncShop · Webs Media · De Wittenkade 152H · 1051 AN Amsterdam<br>
            <a href="https://woosyncshop.com/contact" style="color:#6366f1;text-decoration:none">Contact</a> ·
            <a href="https://woosyncshop.com/voorwaarden" style="color:#6366f1;text-decoration:none">Voorwaarden</a> ·
            <a href="https://woosyncshop.com/privacy" style="color:#6366f1;text-decoration:none">Privacy</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
        })

        // Stamp so we never send again
        await supabase.from('user_profiles')
          .update({ payment_reminder_sent_at: new Date().toISOString() })
          .eq('id', profile.id)

        await supabase.from('system_logs').insert({
          level: 'info', function_name: 'send-payment-reminders',
          message: `Payment reminder sent to ${email} (plan: ${planKey})`,
          metadata: { user_id: profile.id, plan: planKey },
        })

      } catch (userErr) {
        await supabase.from('system_logs').insert({
          level: 'warn', function_name: 'send-payment-reminders',
          message: `Failed to send reminder for user ${profile.id}: ${userErr.message}`,
          metadata: { user_id: profile.id },
        })
      }
    }

  } catch (err) {
    console.error('send-payment-reminders error:', err)
    await supabase.from('system_logs').insert({
      level: 'error', function_name: 'send-payment-reminders',
      message: `Unhandled error: ${err.message}`,
    }).catch(() => {})
  }
}

export const config = {
  schedule: '*/10 * * * *'   // every 10 minutes
}
