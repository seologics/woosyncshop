import { createClient } from '@supabase/supabase-js'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'connected-products', message, metadata: meta }) } catch {}
}

export default async (req) => {
  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  // GET — list all connections
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('connected_products')
      .select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify(data || []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // POST — create connection
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const {
        source_shop_id, source_product_id, source_sku, source_product_name,
        target_shop_id, target_product_id, target_sku,
        match_mode = 'manual', match_attribute = null,
        sync_fields = ['regular_price', 'sale_price', 'stock_quantity'],
      } = body

      if (!source_shop_id || !source_product_id || !target_shop_id || !target_product_id) {
        return new Response(JSON.stringify({ error: 'source_shop_id, source_product_id, target_shop_id, target_product_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      // Check not duplicate
      const { data: existing } = await supabase.from('connected_products')
        .select('id').eq('user_id', user.id).eq('source_shop_id', source_shop_id).eq('source_product_id', source_product_id).eq('target_shop_id', target_shop_id).maybeSingle()
      if (existing) return new Response(JSON.stringify({ error: 'Connection already exists' }), { status: 409, headers: { 'Content-Type': 'application/json' } })

      const { data, error } = await supabase.from('connected_products').insert({
        user_id: user.id, source_shop_id, source_product_id, source_sku: source_sku || null,
        source_product_name: source_product_name || null, target_shop_id, target_product_id, target_sku: target_sku || null,
        match_mode, match_attribute: match_attribute || null,
        sync_fields: sync_fields || ['regular_price', 'sale_price', 'stock_quantity'],
      }).select().single()
      if (error) throw error
      await log(supabase, 'info', `Product connected (${match_mode}): shop ${source_shop_id} p${source_product_id} → shop ${target_shop_id} p${target_product_id}`, { user_id: user.id, match_mode })
      return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // PATCH — update sync_fields (and optionally match settings) for a connection
  if (req.method === 'PATCH') {
    try {
      const url = new URL(req.url, 'https://woosyncshop.com')
      const id = url.searchParams.get('id')
      if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const body = await req.json()
      const allowed = {}
      if (Array.isArray(body.sync_fields)) allowed.sync_fields = body.sync_fields
      if (body.match_mode) allowed.match_mode = body.match_mode
      if ('match_attribute' in body) allowed.match_attribute = body.match_attribute || null
      if (!Object.keys(allowed).length) return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const { data, error } = await supabase.from('connected_products').update(allowed).eq('id', id).eq('user_id', user.id).select().single()
      if (error) throw error
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // DELETE — remove connection
  if (req.method === 'DELETE') {
    const url = new URL(req.url, 'https://woosyncshop.com')
    const id = url.searchParams.get('id')
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    await supabase.from('connected_products').delete().eq('id', id).eq('user_id', user.id)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config = { path: '/api/connected-products' }
