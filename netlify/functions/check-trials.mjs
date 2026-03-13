import { createClient } from '@supabase/supabase-js'

// Runs daily via Netlify scheduled function
// Finds users whose trial_ends_at has passed and marks them as trial_expired

export default async (req) => {
  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    const now = new Date().toISOString()

    // Find all users still on trial whose period has ended
    const { data: expiredUsers, error } = await supabase
      .from('user_profiles')
      .select('id, trial_ends_at, full_name')
      .eq('plan', 'trial')
      .lt('trial_ends_at', now)

    if (error) throw error
    if (!expiredUsers?.length) {
      await supabase.from('system_logs').insert({ level: 'info', function_name: 'check-trials', message: 'No expired trials found', metadata: { checked_at: now } })
      return new Response('OK — 0 expired', { status: 200 })
    }

    let expired = 0
    for (const u of expiredUsers) {
      await supabase.from('user_profiles').update({
        plan: 'trial_expired',
      }).eq('id', u.id)

      await supabase.from('user_plan_history').insert({
        user_id: u.id,
        event_type: 'trial_expired',
        from_plan: 'trial',
        to_plan: 'trial_expired',
        billing_period: 'monthly',
        notes: `Proefperiode verlopen op ${now.slice(0, 10)}`,
      })

      // Send expiry email
      try {
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(u.id)
        const email = authUser?.email
        if (email) {
          const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
          const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
          const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`
          const { default: nodemailer } = await import('nodemailer')
          const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })
          const firstName = (u.full_name || email).split(' ')[0]
          await transporter.sendMail({
            from: '"WooSyncShop" <info@woosyncshop.com>',
            to: email,
            subject: `⏰ Je proefperiode is verlopen — kies een abonnement`,
            html: `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2d3056">
    <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#fff">WooSync<span style="color:#c4b5fd">Shop</span></div>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">Hoi ${firstName}, je proefperiode is verlopen ⏰</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">
        Je gratis proefperiode van WooSyncShop is afgelopen. Om door te gaan met het beheren van je webshops, kies een abonnement dat bij jou past.
      </p>
      <div style="background:#0f1117;border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:16px 20px;margin:0 0 24px">
        <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7">
          🚀 <strong style="color:#c4b5fd">Starter</strong> — €7,99/maand · 2 shops · 500 producten<br>
          📈 <strong style="color:#c4b5fd">Growth</strong> — €11,99/maand · 5 shops · 2.000 producten<br>
          ⚡ <strong style="color:#c4b5fd">Pro</strong> — €19,99/maand · 10 shops · 10.000 producten
        </p>
      </div>
      <div style="text-align:center">
        <a href="https://woosyncshop.com/#billing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">Kies een abonnement →</a>
      </div>
    </td></tr>
    <tr><td style="padding:20px 40px;border-top:1px solid #2d3056;text-align:center">
      <p style="margin:0;font-size:12px;color:#4b5563">WooSyncShop · Webs Media · De Wittenkade 152H · 1051 AN Amsterdam</p>
    </td></tr>
  </table></td></tr></table>
</body></html>`,
          })
        }
      } catch (emailErr) {
        await supabase.from('system_logs').insert({ level: 'warn', function_name: 'check-trials', message: `Expiry email failed for user ${u.id}: ${emailErr.message}` })
      }

      expired++
    }

    await supabase.from('system_logs').insert({ level: 'info', function_name: 'check-trials', message: `Expired ${expired} trial(s)`, metadata: { expired, checked_at: now } })
    return new Response(`OK — ${expired} expired`, { status: 200 })
  } catch (err) {
    console.error('check-trials error:', err)
    return new Response('Error: ' + err.message, { status: 500 })
  }
}

export const config = {
  path: '/api/check-trials',
  schedule: '@daily',
}
