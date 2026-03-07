import { createClient } from '@supabase/supabase-js'

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

  const { error } = await supabase.from('contact_submissions').insert({
    name, email, subject: subject || null, message,
    created_at: new Date().toISOString(),
  })

  if (error) {
    await writeLog(supabase, 'contact', 'error', 'contact_submissions insert failed', {
      code: error.code, detail: error.message, hint: error.hint, email
    })
    return new Response(JSON.stringify({ error: 'Opslaan mislukt', detail: error.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    })
  }

  await writeLog(supabase, 'contact', 'info', 'Contact form submitted', { email, subject })
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export const config = { path: '/api/contact' }
