import { createClient } from '@supabase/supabase-js'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

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
    return new Response(JSON.stringify({ error: 'Opslaan mislukt', detail: insertError.message }), {
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
  } catch (e) {
    await writeLog(supabase, 'contact', 'warn', 'Could not load notification email, using fallback', { fallback: FALLBACK_EMAIL })
  }

  // 3. Send email via SES
  try {
    const accessKeyId = Netlify.env.get('AWS_SES_ACCESS_KEY_ID') || process.env.AWS_SES_ACCESS_KEY_ID
    const secretAccessKey = Netlify.env.get('AWS_SES_SECRET_ACCESS_KEY') || process.env.AWS_SES_SECRET_ACCESS_KEY
    const region = Netlify.env.get('AWS_SES_REGION') || process.env.AWS_SES_REGION || 'eu-west-1'

    await writeLog(supabase, 'contact', 'info', 'SES attempting send', {
      keyId_last4: accessKeyId ? accessKeyId.slice(-4) : 'MISSING',
      region,
      to: notifyEmail
    })

    const ses = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken: undefined,
      }
    })

    const emailBody = `Nieuw contactformulier bericht via WooSyncShop.com\n\nNaam: ${name}\nE-mail: ${email}\nOnderwerp: ${subject || '—'}\n\nBericht:\n${message}\n\n---\nVerzonden via woosyncshop.com/contact`

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [notifyEmail] },
      ReplyToAddresses: [email],
      Message: {
        Subject: { Data: `[WooSyncShop] Contact: ${subject || name}` },
        Body: { Text: { Data: emailBody } }
      }
    }))

    await writeLog(supabase, 'contact', 'info', 'Contact form submitted + email sent', {
      email, subject, notify_to: notifyEmail
    })
  } catch (sesErr) {
    // Email failed but submission was saved — log warning, still return ok
    await writeLog(supabase, 'contact', 'warn', 'SES email failed (submission saved)', {
      error: sesErr.message, notify_to: notifyEmail, email
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}

export const config = { path: '/api/contact' }
