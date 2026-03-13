// netlify/functions/sync-scan.mjs
// POST { source_shop_id, target_shop_id } → { fields, source_plugins, target_plugins, compat_groups, has_wqm, sample_products }

import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS })

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'sync-scan', message, metadata: meta }) } catch {}
}

async function wooGet(shop, endpoint) {
  const base = shop.site_url.replace(/\/$/, '')
  const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  const res = await fetch(`${base}/wp-json/wc/v3/${endpoint}`, {
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`WC GET ${endpoint} HTTP ${res.status}`)
  return res.json()
}

// ── Plugin knowledge base ─────────────────────────────────────────────────
// per_product: true  = stores data in product meta → syncable per product
// per_product: false = global WP options only → NOT syncable per product
const PLUGIN_DB = [
  {
    id: 'wqm',
    name: 'WooCommerce Quantity Manager',
    icon: 'WQM',
    slug_patterns: ['woocommerce-quantity-manager', 'woo-quantity-manager', 'wqm'],
    meta_keys: ['_wqm_tiers', '_wqm_settings', '_wqm_min_quantity', '_wqm_max_quantity', '_wqm_step', '_wqm_group_of'],
    field_group: 'wqm',
    compatible_targets: ['wqm', 'wpc_pbq'],
    per_product: true,
    url: 'https://woocommerce.com/products/quantity-manager/',
  },
  {
    id: 'wpc_pbq',
    name: 'WPC Price by Quantity',
    icon: 'WPC',
    slug_patterns: ['wpc-price-by-quantity'],
    meta_keys: ['wpcpq_enable', 'wpcpq_prices'],
    field_group: 'wpc_pbq',
    compatible_targets: ['wpc_pbq', 'wqm'],
    per_product: true,
    url: 'https://wordpress.org/plugins/wpc-price-by-quantity/',
  },
  {
    id: 'pqdfw',
    name: 'Product Quantity Dropdown',
    icon: 'PQD',
    slug_patterns: ['product-quantity-dropdown-for-woocommerce'],
    meta_keys: [],
    field_group: null,
    compatible_targets: [],
    per_product: false,
    note: 'Gebruikt alleen globale instellingen — geen per-product hoeveelheidsdata kan worden gesynchroniseerd',
    url: 'https://wordpress.org/plugins/product-quantity-dropdown-for-woocommerce/',
  },
]

function detectPlugins(activePluginPaths, productMetaKeys = []) {
  const results = []
  for (const def of PLUGIN_DB) {
    const fromStatus = activePluginPaths.some(p =>
      def.slug_patterns.some(pat => p.toLowerCase().includes(pat))
    )
    const fromMeta = def.meta_keys.length > 0 && def.meta_keys.some(k => productMetaKeys.includes(k))
    if (fromStatus || fromMeta) {
      results.push({
        id: def.id, name: def.name, icon: def.icon,
        detected_via: fromStatus ? 'system_status' : 'meta_keys',
        url: def.url, per_product: def.per_product,
        field_group: def.field_group, note: def.note || null,
      })
    }
  }
  return results
}

function buildCompatGroups(sourcePlugins, targetPlugins) {
  const groups = []
  for (const src of sourcePlugins) {
    const def = PLUGIN_DB.find(d => d.id === src.id)
    if (!def || !def.per_product) continue

    const exactMatch       = targetPlugins.find(t => t.id === src.id)
    const convertibleMatch = targetPlugins.find(t => def.compatible_targets.includes(t.id) && t.id !== src.id)
    const globalOnlyMatch  = targetPlugins.find(t => {
      const td = PLUGIN_DB.find(d => d.id === t.id)
      return td && !td.per_product
    })

    if (exactMatch) {
      groups.push({
        field_group: def.field_group,
        source_plugin: { id: src.id, name: src.name, icon: src.icon },
        status: 'compatible',
        target_plugin: { id: exactMatch.id, name: exactMatch.name, icon: exactMatch.icon },
        message: `${src.name} actief op beide shops — velden worden 1-op-1 gesynchroniseerd.`,
      })
    } else if (convertibleMatch) {
      groups.push({
        field_group: def.field_group,
        source_plugin: { id: src.id, name: src.name, icon: src.icon },
        status: 'convertible',
        target_plugin: { id: convertibleMatch.id, name: convertibleMatch.name, icon: convertibleMatch.icon },
        message: `Data wordt automatisch omgezet van ${src.name} naar ${convertibleMatch.name}-formaat.`,
      })
    } else if (globalOnlyMatch) {
      groups.push({
        field_group: def.field_group,
        source_plugin: { id: src.id, name: src.name, icon: src.icon },
        status: 'global_only',
        target_plugin: { id: globalOnlyMatch.id, name: globalOnlyMatch.name, icon: globalOnlyMatch.icon },
        message: `${globalOnlyMatch.name} op de doelshop gebruikt alleen globale instellingen — per-product data van ${src.name} kan niet worden gesynchroniseerd.`,
        suggestion: `Installeer ${def.name} of WPC Price by Quantity op de doelshop voor volledige compatibiliteit.`,
        suggestion_url: def.url,
      })
    } else {
      groups.push({
        field_group: def.field_group,
        source_plugin: { id: src.id, name: src.name, icon: src.icon },
        status: 'missing',
        target_plugin: null,
        message: `${src.name} is niet gedetecteerd op de doelshop — velden worden overgeslagen.`,
        suggestion: `Installeer ${def.name} op de doelshop om deze velden te synchroniseren.`,
        suggestion_url: def.url,
      })
    }
  }
  return groups
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

  const sourceShopId = body.source_shop_id || body.shop_id
  const targetShopId = body.target_shop_id || null
  if (!sourceShopId) return json({ error: 'source_shop_id required' }, 400)

  try {
    const { data: sourceShop } = await supabase
      .from('shops').select('id, name, site_url, consumer_key, consumer_secret, active_plugins')
      .eq('id', sourceShopId).eq('user_id', user.id).single()
    if (!sourceShop) return json({ error: 'Bronshop niet gevonden' }, 404)

    let targetShop = null
    if (targetShopId) {
      const { data } = await supabase
        .from('shops').select('id, name, site_url, consumer_key, consumer_secret, active_plugins')
        .eq('id', targetShopId).eq('user_id', user.id).single()
      targetShop = data || null
    }

    // Fetch first 5 products from source with full meta
    const products = await wooGet(sourceShop,
      'products?per_page=5&status=any&_fields=id,name,sku,type,regular_price,sale_price,description,short_description,stock_quantity,manage_stock,categories,images,attributes,meta_data'
    ).catch(() => [])

    const allSourceMetaKeys = new Set()
    if (Array.isArray(products)) {
      products.forEach(p => (p.meta_data || []).forEach(m => allSourceMetaKeys.add(m.key)))
    }

    // Detect plugins via system_status on both shops (best signal), meta fingerprint as fallback on source
    const getSystemPlugins = async (shop) => {
      if (!shop?.consumer_key) return []
      try {
        const status = await wooGet(shop, 'system_status')
        return (status?.active_plugins || []).map(p =>
          typeof p === 'string' ? p : (p.plugin || p.slug || '')
        ).filter(Boolean)
      } catch { return [] }
    }

    const [sourcePluginPaths, targetPluginPaths] = await Promise.all([
      getSystemPlugins(sourceShop),
      getSystemPlugins(targetShop),
    ])

    const sourcePlugins = detectPlugins(sourcePluginPaths, Array.from(allSourceMetaKeys))
    const targetPlugins = targetShop ? detectPlugins(targetPluginPaths, []) : []
    const compatGroups  = buildCompatGroups(sourcePlugins, targetPlugins)

    // Standard field detection based on product data
    const FIELD_DEFS = [
      { key: 'stock_quantity',    label: 'Voorraad (stock_quantity)',    check: p => p.manage_stock && p.stock_quantity != null },
      { key: 'price',             label: 'Prijs (regular_price)',         check: p => !!p.regular_price },
      { key: 'sale_price',        label: 'Actieprijs (sale_price)',       check: p => !!p.sale_price },
      { key: 'description',       label: 'Productbeschrijving',           check: p => p.description && p.description.replace(/<[^>]+>/g, '').trim().length > 0 },
      { key: 'short_description', label: 'Korte beschrijving',            check: p => p.short_description && p.short_description.replace(/<[^>]+>/g, '').trim().length > 0 },
      { key: 'categories',        label: 'Categorieën',                   check: p => Array.isArray(p.categories) && p.categories.length > 0 },
      { key: 'images',            label: 'Afbeeldingen',                  check: p => Array.isArray(p.images) && p.images.length > 0 },
      { key: 'attributes',        label: 'Attributen & variaties',        check: p => Array.isArray(p.attributes) && p.attributes.length > 0 },
    ]

    const fields = FIELD_DEFS.map(def => ({
      key: def.key,
      label: def.label,
      detected: Array.isArray(products) && products.some(def.check),
    }))

    // WQM field group
    const WQM_KEYS = ['_wqm_tiers', '_wqm_settings', '_wqm_min_quantity', '_wqm_max_quantity', '_wqm_step', '_wqm_group_of']
    const hasWqmMeta    = Array.isArray(products) && products.some(p =>
      Array.isArray(p.meta_data) && p.meta_data.some(m => WQM_KEYS.includes(m.key))
    )
    const wqmFromPlugin = sourcePlugins.some(p => p.id === 'wqm')
    const hasWqm        = hasWqmMeta || wqmFromPlugin

    const wqmFields = hasWqm ? [
      { key: 'wqm_tiers',     label: 'WQM Prijstrappen (tiers)',           detected: hasWqmMeta, group: 'wqm' },
      { key: 'wqm_min_qty',   label: 'WQM Min. hoeveelheid',               detected: hasWqmMeta, group: 'wqm' },
      { key: 'wqm_max_qty',   label: 'WQM Max. hoeveelheid',               detected: hasWqmMeta, group: 'wqm' },
      { key: 'wqm_step',      label: 'WQM Stapgrootte (step)',              detected: hasWqmMeta, group: 'wqm' },
      { key: 'wqm_group_of',  label: 'WQM Groepsgrootte (group_of)',        detected: hasWqmMeta, group: 'wqm' },
      { key: 'overwrite_wqm', label: 'WQM: overschrijf eigen berekening',   detected: true,       group: 'wqm' },
    ] : []

    const sampleProducts = Array.isArray(products) ? products.map(p => ({
      id: p.id, name: p.name, sku: p.sku || '', type: p.type, price: p.regular_price || '',
    })) : []

    await log(supabase, 'info',
      `Sync scan: ${sourceShop.name} -> ${targetShop?.name || '?'} | velden: ${fields.filter(f => f.detected).length} | src: ${sourcePlugins.map(p => p.id).join(',') || 'none'} | tgt: ${targetPlugins.map(p => p.id).join(',') || 'none'}`,
      { user_id: user.id, source_shop_id: sourceShopId, target_shop_id: targetShopId }
    )

    return json({
      fields: [...fields, ...wqmFields],
      has_wqm: hasWqm,
      source_plugins: sourcePlugins,
      target_plugins: targetPlugins,
      compat_groups: compatGroups,
      sample_products: sampleProducts,
      source_shop_name: sourceShop.name,
      target_shop_name: targetShop?.name || null,
    })
  } catch (err) {
    await log(supabase, 'error', `Sync scan error: ${err.message}`, { user_id: user.id })
    return json({ error: err.message }, 500)
  }
}

export const config = { path: '/api/sync-scan' }
