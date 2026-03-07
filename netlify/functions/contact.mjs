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

  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const serviceKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase env vars')
    return new Response(JSON.stringify({ error: 'Server configuratiefout' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  // Use service role key — bypasses RLS entirely
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  })

  const { error } = await supabase.from('contact_submissions').insert({
    name,
    email,
    subject: subject || null,
    message,
    created_at: new Date().toISOString(),
  })

  if (error) {
    console.error('Contact insert error:', JSON.stringify(error))
    return new Response(JSON.stringify({ error: 'Opslaan mislukt', detail: error.message, code: error.code }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

export const config = { path: '/api/contact' }
