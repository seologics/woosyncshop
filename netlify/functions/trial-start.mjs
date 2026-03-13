import { createClient } from '@supabase/supabase-js'

const TRIAL_DAYS = 7
const PLAN_LIMITS_STARTER = { max_shops: 2, max_connected_products: 500 }

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'trial-start', message, metadata: meta }) } catch {}
}

async function sendTrialWelcomeEmail(supabase, email, fullName, trialEndsAt) {
  try {
    const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
    const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
    const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`
    const { default: nodemailer } = await import('nodemailer')
    const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })
    const firstName = (fullName || email).split(' ')[0]
    const endDate = new Date(trialEndsAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

    await transporter.sendMail({
      from: '"WooSyncShop" <info@woosyncshop.com>',
      to: email,
      subject: `🚀 Welkom bij WooSyncShop — je proefperiode is gestart`,
      html: `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2d3056">
    <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#fff">WooSync<span style="color:#c4b5fd">Shop</span></div>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">Hoi ${firstName}, welkom! 🎉</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">
        Je <strong style="color:#c4b5fd">7-daagse gratis proefperiode</strong> van WooSyncShop Starter is gestart.<br>
        Je hebt tot <strong style="color:#f1f5f9">${endDate}</strong> volledige toegang zonder kosten.
      </p>
      <div style="background:#0f1117;border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:16px 20px;margin:0 0 24px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#c4b5fd">Inbegrepen in je proefperiode:</p>
        <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7">
          ✓ Tot 2 shops koppelen<br>
          ✓ 500 verbonden producten<br>
          ✓ Volledige product- en voorraadbeheer<br>
          ✓ AI Image pipeline<br>
          ✓ Hreflang manager
        </p>
      </div>
      <div style="text-align:center;margin:0 0 8px">
        <a href="https://woosyncshop.com/" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">Naar mijn dashboard →</a>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#4b5563;text-align:center">
        Na ${TRIAL_DAYS} dagen wordt je account automatisch bevroren. Je kiest zelf wanneer je wilt upgraden.
      </p>
    </td></tr>
    <tr><td style="padding:20px 40px;border-top:1px solid #2d3056;text-align:center">
      <p style="margin:0;font-size:12px;color:#4b5563">WooSyncShop · Webs Media · De Wittenkade 152H · 1051 AN Amsterdam</p>
    </td></tr>
  </table></td></tr></table>
</body></html>`,
    })
  } catch (e) {
    await log(supabase, 'warn', `Trial welcome email failed for ${email}: ${e.message}`)
  }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    // Check if user already has an active plan (prevent abuse)
    const { data: profile } = await supabase.from('user_profiles').select('plan, trial_ends_at, full_name').eq('id', user.id).single()
    if (profile?.plan && !['pending_payment', 'trial_expired'].includes(profile.plan)) {
      return new Response(JSON.stringify({ error: 'Account heeft al een actief plan' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('user_profiles').update({
      plan: 'trial',
      chosen_plan: 'starter',
      billing_period: 'monthly',
      trial_ends_at: trialEndsAt,
      billing_cycle_start: new Date().toISOString(),
      max_shops: PLAN_LIMITS_STARTER.max_shops,
      max_connected_products: PLAN_LIMITS_STARTER.max_connected_products,
      pending_downgrade_plan: null,
    }).eq('id', user.id)

    await supabase.from('user_plan_history').insert({
      user_id: user.id,
      event_type: 'trial_started',
      from_plan: null,
      to_plan: 'trial',
      billing_period: 'monthly',
      notes: `Gratis proefperiode gestart — ${TRIAL_DAYS} dagen, eindigt ${trialEndsAt.slice(0, 10)}`,
    })

    await log(supabase, 'info', `Trial started for user ${user.id}`, { trial_ends_at: trialEndsAt })

    // Send welcome email
    await sendTrialWelcomeEmail(supabase, user.email, profile?.full_name, trialEndsAt)

    return new Response(JSON.stringify({ ok: true, trial_ends_at: trialEndsAt }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await log(supabase, 'error', `Trial start failed for user ${user.id}: ${err.message}`)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/trial-start' }
