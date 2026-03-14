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

async function wooGetAll(shop, endpoint, perPage = 100, maxPages = 50) {
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

// ── Tier plugin conversion helpers ───────────────────────────────────────────

/**
 * Detect which tier-pricing plugin a shop is running from its stored active_plugins IDs.
 * IDs match what sync-scan.mjs persists: 'wqm' | 'wpc_pbq'
 */
function detectTierPlugin(activePlugins = []) {
  const ids = Array.isArray(activePlugins) ? activePlugins : []
  if (ids.includes('wqm')) return 'wqm'
  if (ids.includes('wpc_pbq')) return 'wpcpq'
  return null
}

/**
 * Detect tier plugin directly from a product's meta_data keys.
 * Used as a reliable fallback when active_plugins isn't populated.
 */
function detectTierPluginFromMeta(metaData = []) {
  const keys = metaData.map(m => m.key)
  if (keys.includes('_wqm_tiers')) return 'wqm'
  if (keys.includes('wpcpq_prices')) return 'wpcpq'
  return null
}

/**
 * Safely parse a meta value that may be a JSON string or already an object/array.
 */
function parseMeta(value) {
  if (!value) return null
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

/**
 * Convert WQM _wqm_tiers → WPC PBQ wpcpq_prices format.
 *
 * WQM format:  { type: 'fixed'|'percent', tiers: { '0': { qty, amt }, ... } }
 * WPC PBQ:     [ { qty: number, price: '9.99'|'', discount: '10'|'' }, ... ]
 *
 * type 'fixed'   → price = amt (with markup), discount = ''
 * type 'percent' → price = '',  discount = amt (markup ignored — it's already a %)
 */
function wqmToWpcpq(wqmMeta, markupPct = 0) {
  if (!wqmMeta) return null
  const raw = wqmMeta.tiers
    ? (Array.isArray(wqmMeta.tiers) ? wqmMeta.tiers : Object.values(wqmMeta.tiers))
    : []
  if (!raw.length) return null

  const tierType = wqmMeta.type || 'fixed'
  const factor   = 1 + markupPct / 100

  const wpcpqPrices = raw.map(t => {
    const qty = Number(t.qty) || 1
    if (tierType === 'percent') {
      return { qty, price: '', discount: String(t.amt ?? '') }
    }
    const n     = parseFloat(String(t.amt ?? '0').replace(',', '.')) || 0
    const final = markupPct !== 0 ? Math.round(n * factor * 100) / 100 : n
    return { qty, price: String(final), discount: '' }
  })

  return [
    { key: 'wpcpq_prices',  value: wpcpqPrices },
    { key: '_wqm_tiers',    value: null },    // clear source-format keys on target
    { key: '_wqm_settings', value: null },
  ]
}

/**
 * Convert WPC PBQ wpcpq_prices → WQM _wqm_tiers format.
 *
 * WPC PBQ: [ { qty, price: '9.99'|'', discount: '10'|'' }, ... ]
 * WQM:     { type: 'fixed'|'percent', tiers: { '0': { qty, amt }, ... } }
 *
 * Determines type from first non-empty tier (price → fixed, discount → percent).
 * Markup only applied to fixed-price tiers.
 */
function wpcpqToWqm(wpcpqMeta, markupPct = 0) {
  if (!Array.isArray(wpcpqMeta) || !wpcpqMeta.length) return null

  const factor = 1 + markupPct / 100
  const firstWithPrice = wpcpqMeta.find(t => t.price && String(t.price).trim() !== '')
  const tierType       = firstWithPrice ? 'fixed' : 'percent'

  const tiersObj = {}
  wpcpqMeta.forEach((t, i) => {
    const qty = Number(t.qty) || 1
    if (tierType === 'fixed' && t.price && String(t.price).trim() !== '') {
      const n     = parseFloat(String(t.price).replace(',', '.')) || 0
      const final = markupPct !== 0 ? Math.round(n * factor * 100) / 100 : n
      tiersObj[String(i)] = { qty, amt: String(final) }
    } else if (tierType === 'percent' && t.discount && String(t.discount).trim() !== '') {
      tiersObj[String(i)] = { qty, amt: String(t.discount) }  // no markup on %
    } else {
      tiersObj[String(i)] = { qty, amt: String(t.price || t.discount || '0') }
    }
  })

  if (!Object.keys(tiersObj).length) return null

  return [
    { key: '_wqm_tiers',    value: { type: tierType, tiers: tiersObj } },
    { key: '_wqm_settings', value: { tiered_pricing_type: tierType, step_interval: '1', qty_design: 'select' } },
    { key: 'wpcpq_prices',  value: null },   // clear source-format key on target
  ]
}

// Build the payload of fields to sync based on field selection
// srcPlugin / tgtPlugin: 'wqm' | 'wpcpq' | null  (passed from request body, derived from scan)
function buildSyncPayload(sourceProduct, fields, markupPct = 0, srcPlugin = null, tgtPlugin = null) {
  const payload = {}

  // Apply price markup: multiply by (1 + pct/100), round to 2 decimals
  const applyMarkup = (priceStr) => {
    if (!priceStr) return priceStr
    const n = parseFloat(priceStr)
    if (isNaN(n) || markupPct === 0) return priceStr
    return String(Math.round(n * (1 + markupPct / 100) * 100) / 100)
  }

  if (fields.includes('stock_quantity')) {
    payload.stock_quantity = sourceProduct.stock_quantity ?? null
    payload.manage_stock = sourceProduct.manage_stock ?? false
    payload.stock_status = sourceProduct.stock_status || 'instock'
  }
  if (fields.includes('price')) {
    if (sourceProduct.regular_price != null) payload.regular_price = applyMarkup(String(sourceProduct.regular_price))
  }
  if (fields.includes('sale_price')) {
    if (sourceProduct.sale_price != null) payload.sale_price = applyMarkup(String(sourceProduct.sale_price))
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

  // ── Tier pricing ────────────────────────────────────────────────────────────
  const wantsTiers = fields.includes('wqm_tiers')
  const sourceMeta = sourceProduct.meta_data || []

  if (wantsTiers) {
    // Resolve source plugin — prefer explicit param, fall back to meta fingerprint
    const resolvedSrcPlugin = srcPlugin || detectTierPluginFromMeta(sourceMeta)

    const getRawMeta = (key) => {
      const entry = sourceMeta.find(m => m.key === key)
      return entry ? parseMeta(entry.value) : null
    }

    const wqmTiersRaw    = getRawMeta('_wqm_tiers')
    const wpcpqPricesRaw = getRawMeta('wpcpq_prices')

    let extraMeta = []

    if (resolvedSrcPlugin === 'wqm' && tgtPlugin === 'wpcpq' && wqmTiersRaw) {
      // ── WQM → WPC PBQ ──────────────────────────────────────────────────────
      const converted = wqmToWpcpq(wqmTiersRaw, markupPct)
      if (converted) extraMeta = converted

    } else if (resolvedSrcPlugin === 'wpcpq' && tgtPlugin === 'wqm' && wpcpqPricesRaw) {
      // ── WPC PBQ → WQM ──────────────────────────────────────────────────────
      const converted = wpcpqToWqm(wpcpqPricesRaw, markupPct)
      if (converted) extraMeta = converted

    } else if (resolvedSrcPlugin === 'wqm' && (tgtPlugin === 'wqm' || tgtPlugin === null) && wqmTiersRaw) {
      // ── WQM → WQM (same plugin, apply markup) ──────────────────────────────
      const tiersData  = JSON.parse(JSON.stringify(wqmTiersRaw))  // deep clone
      const tierType   = tiersData.type || 'fixed'
      const tierList   = tiersData.tiers
      if (tierList && typeof tierList === 'object' && markupPct !== 0 && tierType === 'fixed') {
        for (const key of Object.keys(tierList)) {
          const n = parseFloat(String(tierList[key].amt ?? '0').replace(',', '.'))
          if (!isNaN(n)) tierList[key].amt = String(Math.round(n * (1 + markupPct / 100) * 100) / 100)
        }
      }
      extraMeta = [{ key: '_wqm_tiers', value: tiersData }]
      const wqmSettingsRaw = getRawMeta('_wqm_settings')
      if (wqmSettingsRaw) extraMeta.push({ key: '_wqm_settings', value: wqmSettingsRaw })

    } else if (resolvedSrcPlugin === 'wpcpq' && (tgtPlugin === 'wpcpq' || tgtPlugin === null) && wpcpqPricesRaw) {
      // ── WPC PBQ → WPC PBQ (apply markup to fixed tiers) ───────────────────
      const factor  = 1 + markupPct / 100
      const marked  = wpcpqPricesRaw.map(t => {
        if (markupPct !== 0 && t.price && String(t.price).trim() !== '') {
          const n = parseFloat(String(t.price).replace(',', '.')) || 0
          return { ...t, price: String(Math.round(n * factor * 100) / 100) }
        }
        return { ...t }
      })
      extraMeta = [{ key: 'wpcpq_prices', value: marked }]

    } else {
      // ── Fallback: copy whatever meta exists as-is ──────────────────────────
      if (wqmTiersRaw)    extraMeta.push({ key: '_wqm_tiers',   value: wqmTiersRaw })
      if (wpcpqPricesRaw) extraMeta.push({ key: 'wpcpq_prices', value: wpcpqPricesRaw })
      const wqmSettingsRaw = getRawMeta('_wqm_settings')
      if (wqmSettingsRaw) extraMeta.push({ key: '_wqm_settings', value: wqmSettingsRaw })
    }

    if (extraMeta.length > 0) {
      payload.meta_data = [...(payload.meta_data || []), ...extraMeta]
    }
  }

  // ── Non-tier WQM meta fields ────────────────────────────────────────────────
  const wqmSimpleMeta = []
  const sourceMeta2 = sourceProduct.meta_data || []

  if (fields.includes('wqm_min_qty')) {
    const m = sourceMeta2.find(m => m.key === '_wqm_min_quantity')
    if (m) wqmSimpleMeta.push({ key: '_wqm_min_quantity', value: m.value })
  }
  if (fields.includes('wqm_max_qty')) {
    const m = sourceMeta2.find(m => m.key === '_wqm_max_quantity')
    if (m) wqmSimpleMeta.push({ key: '_wqm_max_quantity', value: m.value })
  }
  if (fields.includes('wqm_step')) {
    const m = sourceMeta2.find(m => m.key === '_wqm_step')
    if (m) wqmSimpleMeta.push({ key: '_wqm_step', value: m.value })
  }
  if (fields.includes('wqm_group_of')) {
    const m = sourceMeta2.find(m => m.key === '_wqm_group_of')
    if (m) wqmSimpleMeta.push({ key: '_wqm_group_of', value: m.value })
  }
  if (fields.includes('overwrite_wqm')) {
    wqmSimpleMeta.push({ key: '_wqm_overwrite', value: '1' })
  }

  if (wqmSimpleMeta.length > 0) {
    payload.meta_data = [...(payload.meta_data || []), ...wqmSimpleMeta]
  }

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
    match_strategy = 'sku',        // 'sku' | 'identifier' | 'mapping' | 'confirmed_mapping'
    confirmed_mappings = [],        // [{ source_id, target_id }] — used with confirmed_mapping strategy
    price_markup_pct = 0,           // percentage markup applied to all prices (e.g. 10 = +10%)
    source_plugin_id = null,        // 'wqm' | 'wpcpq' | null — tier plugin on source (from scan result)
    target_plugin_id = null,        // 'wqm' | 'wpcpq' | null — tier plugin on target (from scan result)
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

    // Resolve tier plugin for each shop.
    // Primary: plugin IDs passed from the frontend (set during scan step).
    // Fallback: detect from shops.active_plugins (set by PluginWizardModal or sync-scan).
    const resolvedSrcPlugin = source_plugin_id || detectTierPlugin(sourceShop.active_plugins)
    const resolvedTgtPlugin = target_plugin_id || detectTierPlugin(targetShop.active_plugins)

    await log(supabase, 'info', `Stock sync started: ${sourceShop.name} → ${targetShop.name} (${match_strategy}, ${fields.join(',')}, src:${resolvedSrcPlugin||'?'}, tgt:${resolvedTgtPlugin||'?'})`, { user_id: user.id })

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

    } else if (match_strategy === 'confirmed_mapping') {
      // Pre-confirmed matches from AI matching or manual selection
      // Shape: confirmed_mappings: [{ source_id, target_id }]
      const targetIdMap = {}
      for (const tp of targetProducts) targetIdMap[tp.id] = tp

      const confirmedLookup = {}
      for (const m of (confirmed_mappings || [])) {
        const tp = targetIdMap[m.target_id]
        if (tp) confirmedLookup[m.source_id] = { product: tp, variation_id: null }
      }
      lookupFn = (src) => confirmedLookup[src.id] || null

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

        const payload = buildSyncPayload(src, fields, price_markup_pct, resolvedSrcPlugin, resolvedTgtPlugin)
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
