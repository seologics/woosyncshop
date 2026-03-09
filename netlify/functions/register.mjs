import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    const body = await req.json()
    const { email, password, metadata } = body

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'E-mail en wachtwoord zijn verplicht.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Wachtwoord moet minimaal 8 tekens zijn.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Check if user already exists
    const { data: { users: existing } } = await supabase.auth.admin.listUsers()
    const alreadyExists = existing?.some(u => u.email?.toLowerCase() === email.toLowerCase())
    if (alreadyExists) {
      return new Response(JSON.stringify({ error: 'Dit e-mailadres is al in gebruik.' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    }

    // Create user via admin API — email_confirm: true skips the confirmation email entirely
    const { data: { user }, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // <-- user is confirmed immediately, no email sent
      user_metadata: metadata || {},
    })

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Create user_profile row immediately so data is available
    if (user?.id && metadata) {
      await supabase.from('user_profiles').upsert({
        id: user.id,
        full_name: metadata.full_name || '',
        business_name: metadata.business_name || null,
        country: metadata.country || null,
        vat_number: metadata.vat_number || null,
        vat_validated: metadata.vat_validated || false,
        address_street: metadata.address_street || null,
        address_zip: metadata.address_zip || null,
        address_city: metadata.address_city || null,
        plan: metadata.plan || 'pro',
        price_total: metadata.price_total ? parseFloat(metadata.price_total) : null,
        vat_rate: metadata.vat_rate ? parseFloat(metadata.vat_rate) : 21,
      })
    }

    // ── Welcome email for free_forever accounts ───────────────────────────
    if (metadata?.plan === 'free_forever') {
      try {
        const firstName = (metadata.full_name || email).split(' ')[0]
        const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
        const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
        const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`

        const transporter = nodemailer.createTransport({
          host: smtpHost, port: 465, secure: true,
          auth: { user: smtpUser, pass: smtpPass },
        })

        await transporter.sendMail({
          from: '"WooSyncShop" <info@woosyncshop.com>',
          to: email,
          subject: 'Welkom bij WooSyncShop 🎁 — je gratis account is klaar',
          html: `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2d3056">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px">WooSync<span style="color:#c4b5fd">Shop</span></div>
          <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:6px">Multi-shop WooCommerce beheer</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px">
          <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">Hoi ${firstName}, welkom! 👋</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#94a3b8">
            Je gratis WooSyncShop account is aangemaakt. Met je <strong style="color:#c4b5fd">Free Forever</strong> account kun je direct aan de slag:
          </p>

          <!-- Feature list -->
          <table cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0">
            ${[
              ['🏪', 'Tot 2 WooCommerce shops verbinden'],
              ['📦', 'Tot 500 producten synchroniseren'],
              ['🌍', 'AI-vertalingen tussen shops'],
              ['🔗', 'Verbonden producten beheren'],
            ].map(([icon, text]) => `
            <tr><td style="padding:7px 0">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:18px;padding-right:12px;vertical-align:middle">${icon}</td>
                <td style="font-size:14px;color:#e2e8f0;vertical-align:middle">${text}</td>
              </tr></table>
            </td></tr>`).join('')}
          </table>

          <!-- Limits note -->
          <div style="background:#0f1117;border:1px solid #2d3056;border-radius:8px;padding:16px 20px;margin:20px 0">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#c4b5fd">ℹ️ Over je account limieten</p>
            <p style="margin:0;font-size:13px;line-height:1.7;color:#94a3b8">
              Je gratis account heeft vaste limieten. Wil je meer shops, meer producten of extra functies?
              Neem dan contact met ons op via de <strong style="color:#e2e8f0">Help</strong> knop in het dashboard
              of stuur een bericht via de <strong style="color:#e2e8f0">contactpagina</strong> — we helpen je graag verder.
            </p>
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin:28px 0 8px">
            <a href="https://woosyncshop.com" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">
              Ga naar dashboard →
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
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

        await supabase.from('system_logs').insert({
          level: 'info', function_name: 'register',
          message: `Welcome email sent to free_forever user: ${email}`,
          metadata: { user_id: user?.id },
        })
      } catch (mailErr) {
        // Non-fatal — log but don't fail the registration
        await supabase.from('system_logs').insert({
          level: 'warn', function_name: 'register',
          message: `Welcome email failed for ${email}: ${mailErr.message}`,
          metadata: { user_id: user?.id },
        })
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    await supabase.from('system_logs').insert({
      level: 'info',
      function_name: 'register',
      message: `New user registered: ${email}`,
      metadata: { user_id: user?.id, plan: metadata?.plan || 'pro' },
    })

    return new Response(JSON.stringify({ ok: true, user_id: user?.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('register error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/register' }
