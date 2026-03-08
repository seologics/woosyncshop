import { createClient } from '@supabase/supabase-js'
const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  try {
    const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
    if (authErr || user?.email !== SUPERADMIN_EMAIL) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

    // Revoke token at Google first
    const { data: ps } = await supabase.from('platform_settings').select('google_access_token').eq('id', 1).single()
    if (ps?.google_access_token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${ps.google_access_token}`, { method: 'POST' }).catch(() => {})
    }

    await supabase.from('platform_settings').update({
      google_access_token: null, google_refresh_token: null,
      google_token_expiry: null, google_connected_email: null,
    }).eq('id', 1)

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/google-tracking-disconnect' }
