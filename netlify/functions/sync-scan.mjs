// netlify/functions/sync-scan.mjs
// POST { shop_id } → { fields: [...], has_wqm, sample_products }
// Fetches first 5 products from shop, detects which fields have data + WQM meta

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
  if (!res.ok) throw new Error(`WC GET ${endpoint} → HTTP ${res.status}`)
  return res.json()
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

  const { shop_id } = body
  if (!shop_id) return json({ error: 'shop_id required' }, 400)

  try {
    const { data: shop } = await supabase
      .from('shops')
      .select('id, name, site_url, consumer_key, consumer_secret, active_plugins')
      .eq('id', shop_id)
      .eq('user_id', user.id)
      .single()

    if (!shop) return json({ error: 'Shop not found' }, 404)

    // Fetch first 5 products with full meta_data
    const products = await wooGet(shop, 'products?per_page=5&status=any&_fields=id,name,sku,type,regular_price,sale_price,description,short_description,stock_quantity,manage_stock,categories,images,attributes,meta_data')

    if (!Array.isArray(products) || products.length === 0) {
      return json({ fields: [{ key: 'stock_quantity', label: 'Voorraad', detected: true }], has_wqm: false, sample_products: [] })
    }

    // ── Field detection ───────────────────────────────────────────────────────
    const FIELD_DEFS = [
      { key: 'stock_quantity',   label: 'Voorraad (stock_quantity)',   check: p => p.manage_stock && p.stock_quantity != null },
      { key: 'price',            label: 'Prijs (regular_price)',        check: p => !!p.regular_price },
      { key: 'sale_price',       label: 'Actieprijs (sale_price)',      check: p => !!p.sale_price },
      { key: 'description',      label: 'Productbeschrijving',          check: p => p.description && p.description.replace(/<[^>]+>/g, '').trim().length > 0 },
      { key: 'short_description',label: 'Korte beschrijving',           check: p => p.short_description && p.short_description.replace(/<[^>]+>/g, '').trim().length > 0 },
      { key: 'categories',       label: 'Categorieën',                  check: p => Array.isArray(p.categories) && p.categories.length > 0 },
      { key: 'images',           label: 'Afbeeldingen',                 check: p => Array.isArray(p.images) && p.images.length > 0 },
      { key: 'attributes',       label: 'Attributen & variaties',       check: p => Array.isArray(p.attributes) && p.attributes.length > 0 },
    ]

    const fields = FIELD_DEFS.map(def => ({
      key: def.key,
      label: def.label,
      detected: products.some(def.check),
    }))

    // ── WQM detection ─────────────────────────────────────────────────────────
    const WQM_KEYS = ['_wqm_tiers', '_wqm_settings', '_wqm_min_quantity', '_wqm_max_quantity', '_wqm_step', '_wqm_group_of']
    const hasWqm = products.some(p =>
      Array.isArray(p.meta_data) &&
      p.meta_data.some(m => WQM_KEYS.includes(m.key))
    )

    // Also check active_plugins from shop record
    const activePlugins = Array.isArray(shop.active_plugins) ? shop.active_plugins : []
    const wqmFromPlugins = activePlugins.some(pid => pid === 'wqm' || String(pid).includes('wqm'))

    const wqmFields = (hasWqm || wqmFromPlugins) ? [
      { key: 'wqm_tiers',     label: 'WQM Prijstrappen (tiers)',       detected: true, group: 'wqm' },
      { key: 'wqm_min_qty',   label: 'WQM Min. hoeveelheid',           detected: hasWqm, group: 'wqm' },
      { key: 'wqm_max_qty',   label: 'WQM Max. hoeveelheid',           detected: hasWqm, group: 'wqm' },
      { key: 'wqm_step',      label: 'WQM Stapgrootte (step)',          detected: hasWqm, group: 'wqm' },
      { key: 'wqm_group_of',  label: 'WQM Groepsgrootte (group_of)',    detected: hasWqm, group: 'wqm' },
      { key: 'overwrite_wqm', label: 'WQM: overschrijf eigen berekening', detected: true, group: 'wqm' },
    ] : []

    const sampleProducts = products.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku || '',
      type: p.type,
      price: p.regular_price || '',
    }))

    await log(supabase, 'info', `Sync scan: ${shop.name} — ${fields.filter(f => f.detected).length} velden, WQM: ${hasWqm || wqmFromPlugins}`, { user_id: user.id, shop_id })

    return json({
      fields: [...fields, ...wqmFields],
      has_wqm: hasWqm || wqmFromPlugins,
      sample_products: sampleProducts,
      shop_name: shop.name,
    })
  } catch (err) {
    await log(supabase, 'error', `Sync scan error: ${err.message}`, { user_id: user.id, shop_id })
    return json({ error: err.message }, 500)
  }
}

export const config = { path: '/api/sync-scan' }
