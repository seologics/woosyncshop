import { createClient } from '@supabase/supabase-js'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'push-companion', message, metadata: meta }) } catch {}
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const body = await req.json()
  const { shop_id } = body

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
  if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const { data: shop } = await supabase.from('shops').select('*, shop_connections(*)').eq('id', shop_id).eq('user_id', user.id).single()
  if (!shop) {
    await log(supabase, 'warn', 'Push companion: shop not found', { shop_id, user_id: user.id })
    return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }
  if (!shop.companion_token) {
    await log(supabase, 'warn', 'Push companion: no companion token set', { shop_id, site_url: shop.site_url, user_id: user.id })
    return new Response(JSON.stringify({ error: 'No companion token set for this shop' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { data: connectedProducts } = await supabase.from('connected_products').select('*').eq('user_id', user.id)
  const productMap = {}
  for (const cp of connectedProducts || []) {
    const entry = cp.shop_entries?.find(e => e.shop_id === shop_id)
    if (!entry) continue
    const others = cp.shop_entries.filter(e => e.shop_id !== shop_id)
    if (others.length === 0) continue
    productMap[String(entry.product_id)] = others.map(o => ({ site_id: o.shop_id, product_id: o.product_id, product_url: o.product_url || '' }))
  }

  const payload = {
    this_site_id: shop.id,
    this_locale: shop.locale,
    connections: (shop.shop_connections || []).map(c => ({ site_id: c.connected_shop_id, locale: c.locale, base_url: c.base_url, mode: c.mode || 'full' })),
    product_map: productMap,
    page_map: {},
  }

  const pluginUrl = `${shop.site_url.replace(/\/$/, '')}/wp-json/woosyncshop/v1/config`

  try {
    const res = await fetch(pluginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WSS-Token': shop.companion_token },
      body: JSON.stringify(payload),
    })
    const result = await res.json()

    await log(supabase, res.ok ? 'info' : 'warn', `Companion push ${res.ok ? 'succeeded' : 'failed'}`, {
      shop_id, site_url: shop.site_url, user_id: user.id,
      http_status: res.status, products_mapped: Object.keys(productMap).length,
      connections: payload.connections.length,
    })

    return new Response(JSON.stringify({ ok: res.ok, result }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await log(supabase, 'error', 'Companion push exception', { shop_id, site_url: shop.site_url, user_id: user.id, error: err.message })
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/push-companion' }
