import { createClient } from '@supabase/supabase-js'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'woo-test', message, metadata: meta }) } catch {}
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const body = await req.json()
  const { site_url, consumer_key, consumer_secret } = body
  if (!site_url || !consumer_key || !consumer_secret) return new Response(JSON.stringify({ error: 'site_url, consumer_key and consumer_secret required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
  if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const wooUrl = `${site_url.replace(/\/$/, '')}/wp-json/wc/v3/system_status`
  const credentials = btoa(`${consumer_key}:${consumer_secret}`)

  try {
    const res = await fetch(wooUrl, { headers: { 'Authorization': `Basic ${credentials}` } })

    if (!res.ok) {
      await log(supabase, 'warn', 'WooCommerce connection test failed', { user_id: user.id, site_url, http_status: res.status })
      return new Response(JSON.stringify({ ok: false, error: `HTTP ${res.status}` }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const status = await res.json()
    await log(supabase, 'info', 'WooCommerce connection test succeeded', {
      user_id: user.id, site_url,
      wc_version: status.environment?.version,
      wp_version: status.environment?.wp_version,
    })

    return new Response(JSON.stringify({
      ok: true,
      wc_version: status.environment?.version,
      wp_version: status.environment?.wp_version,
      site_url: status.environment?.site_url,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await log(supabase, 'error', 'WooCommerce connection test exception', { user_id: user.id, site_url, error: err.message })
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/woo-test' }
