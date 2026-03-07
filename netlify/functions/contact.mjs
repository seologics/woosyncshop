import { createClient } from '@supabase/supabase-js'

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
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    const { error } = await supabase.from('contact_submissions').insert({
      name,
      email,
      subject: subject || null,
      message,
      created_at: new Date().toISOString(),
    })
    if (error) throw error
  } catch (err) {
    console.error('Contact submission error:', err)
    return new Response(JSON.stringify({ error: 'Opslaan mislukt', detail: err.message }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export const config = { path: '/api/contact' }
