// netlify/functions/stock-sync.mjs
// POST { source_shop_id, target_shop_id, products, fields, match_strategy }
// Syncs selected fields from source → target using SKU / identifier / previously stored mappings
// Returns { synced, failed, unmatched }

import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS })

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'stock-sync', message, metadata: meta }) } catch {}
}

async function wooFetch(shop, endpoint, method = 'GET', body = null) {
  const base = shop.site_url.replace(/\/$/, '')
  const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  const opts = {
    method,
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
  }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)
  const res = await fetch(`${base}/wp-json/wc/v3/${endpoint}`, opts)
  if (!res.ok) throw new Error(`WC ${method} ${endpoint} → HTTP ${res.status}`)
  return res.json()
}

async function wooGetAll(shop, endpoint, perPage = 100, maxPages = 10) {
  let page = 1, all = []
  while (page <= maxPages) {
    const sep = endpoint.includes('?') ? '&' : '?'
    const batch = await wooFetch(shop, `${endpoint}${sep}per_page=${perPage}&page=${page}`)
    if (!Array.isArray(batch) || !batch.length) break
    all = all.concat(batch)
    if (batch.length < perPage) break
    page++
  }
  return all
}

// Build the payload of fields to sync based on field selection
function buildSyncPayload(sourceProduct, fields) {
  const payload = {}

  if (fields.includes('stock_quantity')) {
    payload.stock_quantity = sourceProduct.stock_quantity ?? null
    payload.manage_stock = sourceProduct.manage_stock ?? false
    payload.stock_status = sourceProduct.stock_status || 'instock'
  }
  if (fields.includes('price')) {
    if (sourceProduct.regular_price != null) payload.regular_price = String(sourceProduct.regular_price)
  }
  if (fields.includes('sale_price')) {
    if (sourceProduct.sale_price != null) payload.sale_price = String(sourceProduct.sale_price)
  }
  if (fields.includes('description')) {
    payload.description = sourceProduct.description || ''
  }
  if (fields.includes('short_description')) {
    payload.short_description = sourceProduct.short_description || ''
  }
  if (fields.includes('categories')) {
    payload.categories = sourceProduct.categories || []
  }
  if (fields.includes('images') && Array.isArray(sourceProduct.images)) {
    payload.images = sourceProduct.images.map(img => ({ src: img.src, name: img.name, alt: img.alt }))
  }
  if (fields.includes('attributes')) {
    payload.attributes = sourceProduct.attributes || []
  }

  // WQM fields
  const wqmMeta = []
  const sourceMeta = sourceProduct.meta_data || []

  if (fields.includes('wqm_tiers')) {
    const t = sourceMeta.find(m => m.key === '_wqm_tiers')
    const s = sourceMeta.find(m => m.key === '_wqm_settings')
    if (t) wqmMeta.push({ key: '_wqm_tiers', value: t.value })
    if (s) wqmMeta.push({ key: '_wqm_settings', value: s.value })
  }
  if (fields.includes('wqm_min_qty')) {
    const m = sourceMeta.find(m => m.key === '_wqm_min_quantity')
    if (m) wqmMeta.push({ key: '_wqm_min_quantity', value: m.value })
  }
  if (fields.includes('wqm_max_qty')) {
    const m = sourceMeta.find(m => m.key === '_wqm_max_quantity')
    if (m) wqmMeta.push({ key: '_wqm_max_quantity', value: m.value })
  }
  if (fields.includes('wqm_step')) {
    const m = sourceMeta.find(m => m.key === '_wqm_step')
    if (m) wqmMeta.push({ key: '_wqm_step', value: m.value })
  }
  if (fields.includes('wqm_group_of')) {
    const m = sourceMeta.find(m => m.key === '_wqm_group_of')
    if (m) wqmMeta.push({ key: '_wqm_group_of', value: m.value })
  }
  if (fields.includes('overwrite_wqm')) {
    wqmMeta.push({ key: '_wqm_overwrite', value: '1' })
  }

  if (wqmMeta.length > 0) payload.meta_data = wqmMeta

  return payload
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  let body = {}
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const {
    source_shop_id,
    target_shop_id,
    products: sourceProducts,     // Array of source products (with all fields)
    fields = ['stock_quantity'],   // Which fields to sync
    match_strategy = 'sku',        // 'sku' | 'identifier' | 'mapping'
  } = body

  if (!source_shop_id || !target_shop_id || !Array.isArray(sourceProducts) || sourceProducts.length === 0) {
    return json({ error: 'source_shop_id, target_shop_id, products[] required' }, 400)
  }

  try {
    const [{ data: sourceShop }, { data: targetShop }] = await Promise.all([
      supabase.from('shops').select('*').eq('id', source_shop_id).eq('user_id', user.id).single(),
      supabase.from('shops').select('*').eq('id', target_shop_id).eq('user_id', user.id).single(),
    ])
    if (!sourceShop || !targetShop) return json({ error: 'Shop not found' }, 404)

    await log(supabase, 'info', `Stock sync started: ${sourceShop.name} → ${targetShop.name} (${match_strategy}, ${fields.join(',')})`, { user_id: user.id })

    // Load target products (paginated, up to 1000)
    const targetProducts = await wooGetAll(targetShop, 'products?status=any', 100, 10)

    const synced = []
    const failed = []
    const unmatched = []

    // Build match lookup based on strategy
    let lookupFn

    if (match_strategy === 'sku') {
      // Build SKU → target product map (also include variations)
      const targetSkuMap = {}
      for (const tp of targetProducts) {
        if (tp.sku) targetSkuMap[tp.sku] = { product: tp, variation_id: null }
        if (tp.type === 'variable') {
          try {
            const vars = await wooFetch(targetShop, `products/${tp.id}/variations?per_page=100`)
            if (Array.isArray(vars)) {
              for (const v of vars) {
                if (v.sku) targetSkuMap[v.sku] = { product: tp, variation: v, variation_id: v.id }
              }
            }
          } catch {}
        }
      }
      lookupFn = (src) => targetSkuMap[src.sku] || null

    } else if (match_strategy === 'identifier') {
      // Match via _wss_identifier meta field
      const targetIdentifierMap = {}
      for (const tp of targetProducts) {
        const identMeta = (tp.meta_data || []).find(m => m.key === '_wss_identifier')
        if (identMeta?.value) targetIdentifierMap[identMeta.value] = { product: tp, variation_id: null }
      }
      lookupFn = (src) => {
        const identVal = src.sku || String(src.id)
        return targetIdentifierMap[identVal] || null
      }

    } else if (match_strategy === 'mapping') {
      // Use stored mappings from shop_product_mappings
      const { data: mappings } = await supabase
        .from('shop_product_mappings')
        .select('source_sku, source_woo_id, target_sku, target_woo_id')
        .eq('user_id', user.id)
        .eq('source_shop_id', source_shop_id)
        .eq('target_shop_id', target_shop_id)

      const targetIdMap = {}
      for (const tp of targetProducts) targetIdMap[tp.id] = tp

      const mappingLookup = {}
      for (const m of (mappings || [])) {
        const targetProd = targetIdMap[m.target_woo_id]
        if (targetProd) mappingLookup[m.source_sku || m.source_woo_id] = { product: targetProd, variation_id: null }
      }
      lookupFn = (src) => mappingLookup[src.sku] || mappingLookup[src.id] || null

    } else {
      lookupFn = () => null
    }

    // ── Sync each source product ──────────────────────────────────────────────
    for (const src of sourceProducts) {
      try {
        const match = lookupFn(src)

        if (!match) {
          unmatched.push({ id: src.id, name: src.name, sku: src.sku || '' })
          continue
        }

        const payload = buildSyncPayload(src, fields)
        if (Object.keys(payload).length === 0) continue

        const { product: tp, variation, variation_id } = match

        if (variation_id) {
          // Sync variation
          await wooFetch(targetShop, `products/${tp.id}/variations/${variation_id}`, 'PUT', payload)
        } else {
          // Sync simple/variable product
          await wooFetch(targetShop, `products/${tp.id}`, 'PUT', payload)
        }

        // If WQM tiers synced, do dummy touch to clear transients
        if (fields.some(f => f.startsWith('wqm'))) {
          try { await wooFetch(targetShop, `products/${tp.id}`, 'PUT', { status: 'publish' }) } catch {}
        }

        synced.push({ source_id: src.id, target_id: tp.id, name: src.name, sku: src.sku || '', target_name: tp.name, target_sku: tp.sku || '' })

      } catch (err) {
        failed.push({ id: src.id, name: src.name, sku: src.sku || '', error: err.message })
      }
    }

    // Save sync config back to shops table for future runs
    try {
      await supabase.from('shops').update({
        sync_fields: fields,
        sync_match_strategy: match_strategy,
      }).eq('id', source_shop_id)
    } catch {}

    await log(supabase, 'info', `Stock sync complete: ${synced.length} synced, ${failed.length} failed, ${unmatched.length} unmatched`, {
      user_id: user.id, source_shop_id, target_shop_id,
    })

    return json({
      ok: true,
      synced,
      failed,
      unmatched,
      total_source: sourceProducts.length,
    })

  } catch (err) {
    await log(supabase, 'error', `Stock sync fatal: ${err.message}`, { user_id: user.id })
    return json({ error: err.message }, 500)
  }
}

export const config = { path: '/api/stock-sync' }
