import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

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

  const ses = new SESClient({
    region: Netlify.env.get('AWS_SES_REGION') || 'eu-west-1',
    credentials: {
      accessKeyId: Netlify.env.get('AWS_SES_ACCESS_KEY_ID'),
      secretAccessKey: Netlify.env.get('AWS_SES_SECRET_ACCESS_KEY'),
    },
  })

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:24px;border-radius:8px;">
      <h2 style="color:#6C63FF;margin-top:0;">Nieuw contactbericht</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#666;width:120px;"><strong>Naam:</strong></td><td style="padding:8px 0;">${name}</td></tr>
        <tr><td style="padding:8px 0;color:#666;"><strong>E-mail:</strong></td><td style="padding:8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#666;"><strong>Onderwerp:</strong></td><td style="padding:8px 0;">${subject || '—'}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />
      <div style="background:#fff;padding:16px;border-radius:6px;border:1px solid #e5e5e5;white-space:pre-wrap;line-height:1.6;">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <p style="color:#999;font-size:12px;margin-top:16px;">Verzonden via woosyncshop.com/contact</p>
    </div>
  `

  try {
    await ses.send(new SendEmailCommand({
      Source: 'WooSyncShop <info@woosyncshop.com>',
      Destination: { ToAddresses: ['leadingvation@gmail.com'] },
      ReplyToAddresses: [email],
      Message: {
        Subject: { Data: `[Contact] ${subject || 'Nieuw bericht'} — van ${name}`, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    }))
  } catch (err) {
    console.error('SES error:', err)
    return new Response(JSON.stringify({ error: 'Versturen mislukt', detail: err.message }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export const config = { path: '/api/contact' }
