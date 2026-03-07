import { createClient } from '@supabase/supabase-js'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const token = authHeader.slice(7)
  const body = await req.json()
  const { site_url, consumer_key, consumer_secret } = body

  if (!site_url || !consumer_key || !consumer_secret) {
    return new Response(JSON.stringify({ error: 'site_url, consumer_key and consumer_secret required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // Verify user
  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  // Test the WooCommerce connection
  const baseUrl = site_url.replace(/\/$/, '')
  const wooUrl = `${baseUrl}/wp-json/wc/v3/system_status`
  const credentials = btoa(`${consumer_key}:${consumer_secret}`)

  try {
    const res = await fetch(wooUrl, {
      headers: { 'Authorization': `Basic ${credentials}` }
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `HTTP ${res.status}` }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const status = await res.json()
    return new Response(JSON.stringify({
      ok: true,
      wc_version: status.environment?.version,
      wp_version: status.environment?.wp_version,
      site_url: status.environment?.site_url,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = {
  path: '/api/woo-test'
}
