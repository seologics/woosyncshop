import { createClient } from '@supabase/supabase-js'

// Pushes hreflang + sync config to the WooSyncShop companion plugin on a WP site
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
  const { shop_id } = body

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  // Get the shop + its connections
  const { data: shop } = await supabase
    .from('shops')
    .select('*, shop_connections(*)')
    .eq('id', shop_id)
    .eq('user_id', user.id)
    .single()

  if (!shop) {
    return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  if (!shop.companion_token) {
    return new Response(JSON.stringify({ error: 'No companion token set for this shop' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // Get product map from connected_products table
  const { data: connectedProducts } = await supabase
    .from('connected_products')
    .select('*')
    .eq('user_id', user.id)

  // Build product_map for this shop
  const productMap = {}
  for (const cp of connectedProducts || []) {
    const entry = cp.shop_entries?.find(e => e.shop_id === shop_id)
    if (!entry) continue
    const others = cp.shop_entries.filter(e => e.shop_id !== shop_id)
    if (others.length === 0) continue
    productMap[String(entry.product_id)] = others.map(o => ({
      site_id: o.shop_id,
      product_id: o.product_id,
      product_url: o.product_url || '',
    }))
  }

  // Build the config payload
  const payload = {
    this_site_id: shop.id,
    this_locale: shop.locale,
    connections: (shop.shop_connections || []).map(c => ({
      site_id: c.connected_shop_id,
      locale: c.locale,
      base_url: c.base_url,
      mode: c.mode || 'full',
    })),
    product_map: productMap,
    page_map: {},
  }

  // Push to companion plugin
  const pluginUrl = `${shop.site_url.replace(/\/$/, '')}/wp-json/woosyncshop/v1/config`

  try {
    const res = await fetch(pluginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WSS-Token': shop.companion_token,
      },
      body: JSON.stringify(payload),
    })

    const result = await res.json()
    return new Response(JSON.stringify({ ok: res.ok, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = {
  path: '/api/push-companion'
}
