import { createClient } from '@supabase/supabase-js'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'woo-proxy', message, metadata: meta }) } catch {}
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const { shop_id, endpoint, method = 'GET', data } = body
  if (!shop_id || !endpoint) return new Response(JSON.stringify({ error: 'shop_id and endpoint required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
  if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const { data: shop, error: shopError } = await supabase.from('shops').select('site_url, consumer_key, consumer_secret').eq('id', shop_id).eq('user_id', user.id).single()
  if (shopError || !shop) {
    await log(supabase, 'warn', 'Shop not found or unauthorized', { shop_id, user_id: user.id })
    return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  const baseUrl = shop.site_url.replace(/\/$/, '')
  // Support both WooCommerce REST API (wc/v3/) and WordPress REST API (wp/v2/)
  const wooUrl = endpoint.startsWith('wp/v2/')
    ? `${baseUrl}/wp-json/${endpoint}`
    : `${baseUrl}/wp-json/wc/v3/${endpoint.replace(/^\//, '')}`
  const credentials = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  const fetchOptions = { method, headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' } }
  if (data && method !== 'GET') fetchOptions.body = JSON.stringify(data)

  try {
    const wooRes = await fetch(wooUrl, fetchOptions)
    const wooData = await wooRes.json()

    // Only log writes and errors — not every product read
    if (method !== 'GET') {
      await log(supabase, wooRes.ok ? 'info' : 'warn', `WooCommerce ${method} ${endpoint}`, {
        shop_id, user_id: user.id, site_url: shop.site_url, status: wooRes.status,
        endpoint, ok: wooRes.ok,
      })
    }
    if (!wooRes.ok && method === 'GET') {
      await log(supabase, 'warn', `WooCommerce GET failed: ${endpoint}`, { shop_id, user_id: user.id, status: wooRes.status })
    }

    return new Response(JSON.stringify(wooData), { status: wooRes.status, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await log(supabase, 'error', 'WooCommerce request failed', { shop_id, user_id: user.id, endpoint, error: err.message, site_url: shop.site_url })
    return new Response(JSON.stringify({ error: 'WooCommerce request failed', detail: err.message }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/woo' }
