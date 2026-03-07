import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

// Inline log helper
async function writeLog(supabase, functionName, level, message, meta = {}) {
  try {
    await supabase.from('system_logs').insert({
      function_name: functionName,
      level,
      message,
      meta: Object.keys(meta).length ? meta : null,
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('writeLog failed:', e.message)
  }
}

const FALLBACK_EMAIL = 'leadingvation@gmail.com'
const FROM_EMAIL = 'info@woosyncshop.com'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { name, email, subject, message } = body
  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: 'Naam, e-mail en bericht zijn verplicht' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  )

  // 1. Save to Supabase
  const { error: insertError } = await supabase.from('contact_submissions').insert({
    name, email, subject: subject || null, message,
    created_at: new Date().toISOString(),
  })

  if (insertError) {
    await writeLog(supabase, 'contact', 'error', 'contact_submissions insert failed', {
      code: insertError.code, detail: insertError.message, email
    })
    return new Response(JSON.stringify({ error: 'Opslaan mislukt' }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    })
  }

  // 2. Get notification email from platform_settings
  let notifyEmail = FALLBACK_EMAIL
  try {
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('contact_notification_email')
      .eq('id', 1)
      .single()
    if (settings?.contact_notification_email) {
      notifyEmail = settings.contact_notification_email
    }
  } catch {}

  // 3. Send via SES SMTP (same as Supabase uses)
  try {
    const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
    const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD') // SMTP-derived password
    const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`

    await writeLog(supabase, 'contact', 'info', 'SES SMTP attempting send', {
      host: smtpHost,
      user_last4: smtpUser ? smtpUser.slice(-4) : 'MISSING',
      pass_set: !!smtpPass,
      to: notifyEmail
    })

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    })

    await transporter.sendMail({
      from: `"WooSyncShop" <${FROM_EMAIL}>`,
      to: notifyEmail,
      replyTo: email,
      subject: `[WooSyncShop] Contact: ${subject || name}`,
      text: `Nieuw contactformulier bericht via WooSyncShop.com\n\nNaam: ${name}\nE-mail: ${email}\nOnderwerp: ${subject || '—'}\n\nBericht:\n${message}\n\n---\nVerzonden via woosyncshop.com/contact`,
    })

    await writeLog(supabase, 'contact', 'info', 'Contact form submitted + email sent', {
      email, subject, notify_to: notifyEmail
    })
  } catch (smtpErr) {
    await writeLog(supabase, 'contact', 'warn', 'SMTP email failed (submission saved)', {
      error: smtpErr.message, notify_to: notifyEmail, email
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}

export const config = { path: '/api/contact' }
