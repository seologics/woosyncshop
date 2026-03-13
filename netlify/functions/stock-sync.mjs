import { createClient } from '@supabase/supabase-js'

// POST /api/stock-sync
// Body: { source_shop_id, products: [{ sku, stock_quantity, manage_stock }] }
// Finds all OTHER user shops, fetches products with matching SKUs, updates stock_quantity
// Returns: { synced: N, shops_updated: [...], errors: [...] }

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'stock-sync', message, metadata: meta }) } catch {}
}

async function wooFetch(shop, endpoint, method = 'GET', body = null) {
  const base = shop.site_url.replace(/\/$/, '')
  const url = `${base}/wp-json/wc/v3/${endpoint}`
  const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  const opts = {
    method,
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
  }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`WC ${method} ${endpoint} → HTTP ${res.status}`)
  return res.json()
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  let body
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }

  const { source_shop_id, products } = body
  if (!source_shop_id || !Array.isArray(products) || products.length === 0) {
    return new Response(JSON.stringify({ error: 'source_shop_id en products[] vereist' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    // Load all user shops except source
    const { data: allShops } = await supabase
      .from('shops')
      .select('id, name, site_url, consumer_key, consumer_secret')
      .eq('user_id', user.id)
      .neq('id', source_shop_id)

    if (!allShops?.length) {
      return new Response(JSON.stringify({ synced: 0, shops_updated: [], message: 'Geen andere shops gevonden' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Build SKU → stock map from source
    const skuMap = {}
    for (const p of products) {
      if (p.sku) skuMap[p.sku] = { stock_quantity: p.stock_quantity, manage_stock: p.manage_stock ?? true }
    }
    const skus = Object.keys(skuMap)
    if (!skus.length) {
      return new Response(JSON.stringify({ synced: 0, shops_updated: [], message: 'Geen SKUs gevonden in selectie' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    let totalSynced = 0
    const shopsUpdated = []
    const errors = []

    for (const shop of allShops) {
      if (!shop.consumer_key || !shop.consumer_secret) continue
      try {
        // Fetch all products from target shop (paginated up to 200)
        let page = 1
        let targetProducts = []
        while (true) {
          const batch = await wooFetch(shop, `products?per_page=100&page=${page}&status=any`)
          if (!Array.isArray(batch) || batch.length === 0) break
          targetProducts = targetProducts.concat(batch)
          if (batch.length < 100) break
          page++
          if (page > 2) break // max 200 products per sync to avoid timeout
        }

        let shopSynced = 0
        for (const tp of targetProducts) {
          const sku = tp.sku
          if (!sku || !skuMap[sku]) continue

          const src = skuMap[sku]
          // Update product stock on target
          await wooFetch(shop, `products/${tp.id}`, 'PUT', {
            stock_quantity: src.stock_quantity,
            manage_stock: src.manage_stock,
          })
          shopSynced++
        }

        // Also check variations for variable products
        const variableProducts = targetProducts.filter(p => p.type === 'variable')
        for (const vp of variableProducts) {
          try {
            const variations = await wooFetch(shop, `products/${vp.id}/variations?per_page=100`)
            if (!Array.isArray(variations)) continue
            for (const v of variations) {
              if (!v.sku || !skuMap[v.sku]) continue
              const src = skuMap[v.sku]
              await wooFetch(shop, `products/${vp.id}/variations/${v.id}`, 'PUT', {
                stock_quantity: src.stock_quantity,
                manage_stock: src.manage_stock,
              })
              shopSynced++
            }
          } catch {} // variation fetch failure is non-fatal
        }

        if (shopSynced > 0) {
          shopsUpdated.push({ shop_id: shop.id, name: shop.name, synced: shopSynced })
          totalSynced += shopSynced
        }
      } catch (shopErr) {
        errors.push({ shop_id: shop.id, name: shop.name, error: shopErr.message })
      }
    }

    await log(supabase, 'info', `Stock sync: ${totalSynced} products updated across ${shopsUpdated.length} shops`, {
      user_id: user.id, source_shop_id, skus_requested: skus.length, total_synced: totalSynced,
    })

    return new Response(JSON.stringify({ synced: totalSynced, shops_updated: shopsUpdated, errors }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await log(supabase, 'error', `Stock sync exception: ${err.message}`, { user_id: user.id })
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/stock-sync' }
