import { createClient } from '@supabase/supabase-js'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'sync-products', message, metadata: meta }) } catch {}
}

async function wooGet(shop, endpoint) {
  const base = shop.site_url.replace(/\/$/, '')
  const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  const res = await fetch(`${base}/wp-json/wc/v3/${endpoint}`, {
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' }
  })
  if (!res.ok) throw new Error(`WooCommerce GET ${endpoint} HTTP ${res.status}`)
  return res.json()
}

async function wooPut(shop, endpoint, data) {
  const base = shop.site_url.replace(/\/$/, '')
  const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  const res = await fetch(`${base}/wp-json/wc/v3/${endpoint}`, {
    method: 'PUT',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WooCommerce PUT ${endpoint} HTTP ${res.status}: ${err.slice(0,200)}`)
  }
  return res.json()
}

// Translate a term via Gemini
async function translateTerm(geminiKey, sourceTerm, sourceLocale, targetLocale, existingTerms, model = 'gemini-2.0-flash') {
  const prompt = `You are a WooCommerce product taxonomy translator.
Source locale: ${sourceLocale}
Target locale: ${targetLocale}
Term to translate: "${sourceTerm}"
Existing terms in target shop: ${JSON.stringify(existingTerms)}

Rules:
- If an existing term matches semantically, return that exact term
- If no match, return a natural translation
- For locale ${targetLocale} that is the same language (e.g. nl_NL → nl_BE), usually keep the same term
- Return ONLY valid JSON: {"term": "...", "confidence": 0.0-1.0, "is_existing": true/false}`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  try {
    const { source_shop_id, product_id, fields, target_shop_ids } = await req.json()
    // fields: array of field names to sync e.g. ["name","description","stock_quantity","regular_price","categories","attributes"]
    // target_shop_ids: optional array; if not given, sync to all connected shops

    if (!source_shop_id || !product_id || !fields?.length) {
      return new Response(JSON.stringify({ error: 'source_shop_id, product_id, fields required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Get source shop
    const { data: sourceShop } = await supabase.from('shops').select('*').eq('id', source_shop_id).eq('user_id', user.id).single()
    if (!sourceShop) return new Response(JSON.stringify({ error: 'Source shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    // Get connected product record
    const { data: connections } = await supabase.from('connected_products')
      .select('*').eq('user_id', user.id).eq('source_shop_id', source_shop_id).eq('source_product_id', product_id)

    if (!connections?.length) {
      return new Response(JSON.stringify({ error: 'No connected products found for this product', synced: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Get platform settings (API keys)
    const { data: settings } = await supabase.from('platform_settings').select('gemini_api_key').eq('id', 1).single()
    const geminiKey = settings?.gemini_api_key

    // Get user profile for AI settings
    const { data: profile } = await supabase.from('user_profiles').select('ai_taxonomy_enabled, ai_taxonomy_model, ai_taxonomy_threshold').eq('id', user.id).single()
    const aiEnabled = profile?.ai_taxonomy_enabled && geminiKey
    const aiModel = profile?.ai_taxonomy_model || 'gemini-2.0-flash'
    const aiThreshold = profile?.ai_taxonomy_threshold || 0.85

    // Fetch source product from WooCommerce
    const sourceProduct = await wooGet(sourceShop, `products/${product_id}`)
    let sourceVariations = []
    if (sourceProduct.type === 'variable') {
      sourceVariations = await wooGet(sourceShop, `products/${product_id}/variations?per_page=100`)
    }

    const results = []

    for (const conn of connections) {
      // Filter to requested target shops
      if (target_shop_ids && !target_shop_ids.includes(conn.target_shop_id)) continue

      const { data: targetShop } = await supabase.from('shops').select('*').eq('id', conn.target_shop_id).eq('user_id', user.id).single()
      if (!targetShop) continue

      try {
        const targetProductId = conn.target_product_id
        const syncedFields = {}

        // Build payload for the target product
        const payload = {}

        for (const field of fields) {
          if (field === 'name') {
            let name = sourceProduct.name
            if (aiEnabled && targetShop.locale !== sourceShop.locale) {
              // For product names, use AI translation
              try {
                const translated = await translateTerm(geminiKey, name, sourceShop.locale, targetShop.locale, [], aiModel)
                if (translated.confidence >= aiThreshold) { name = translated.term }
              } catch {}
            }
            payload.name = name
            syncedFields.name = payload.name
          }
          if (field === 'description') { payload.description = sourceProduct.description; syncedFields.description = true }
          if (field === 'short_description') { payload.short_description = sourceProduct.short_description; syncedFields.short_description = true }
          if (field === 'regular_price' && sourceProduct.type !== 'variable') { payload.regular_price = sourceProduct.regular_price; syncedFields.regular_price = sourceProduct.regular_price }
          if (field === 'sale_price' && sourceProduct.type !== 'variable') { payload.sale_price = sourceProduct.sale_price; syncedFields.sale_price = sourceProduct.sale_price }
          if (field === 'stock_quantity' && sourceProduct.manage_stock) {
            payload.manage_stock = true
            payload.stock_quantity = sourceProduct.stock_quantity
            payload.stock_status = sourceProduct.stock_status
            syncedFields.stock_quantity = sourceProduct.stock_quantity
          }
          if (field === 'status') { payload.status = sourceProduct.status; syncedFields.status = sourceProduct.status }

          if (field === 'categories' && sourceProduct.categories?.length) {
            // Get target shop categories for AI matching
            let targetCats = []
            try { targetCats = await wooGet(targetShop, 'products/categories?per_page=100') } catch {}

            const mappedCats = []
            for (const cat of sourceProduct.categories) {
              if (targetShop.locale === sourceShop.locale) {
                // Same language — find by name
                const match = targetCats.find(c => c.name.toLowerCase() === cat.name?.toLowerCase())
                if (match) mappedCats.push({ id: match.id })
              } else if (aiEnabled && geminiKey) {
                // Different language — use AI to find best match
                const cacheKey = `${sourceShop.locale}:${targetShop.locale}:category:${cat.name}`
                const { data: cached } = await supabase.from('ai_translation_cache').select('target_term').eq('cache_key', cacheKey).maybeSingle()

                let targetTerm = cached?.target_term
                if (!targetTerm) {
                  try {
                    const result = await translateTerm(geminiKey, cat.name, sourceShop.locale, targetShop.locale, targetCats.map(c => c.name), aiModel)
                    if (result.confidence >= aiThreshold) {
                      targetTerm = result.term
                      await supabase.from('ai_translation_cache').upsert({
                        cache_key: cacheKey, user_id: user.id,
                        source_locale: sourceShop.locale, target_locale: targetShop.locale,
                        field: 'category', source_term: cat.name, target_term: targetTerm,
                        confidence: result.confidence, model: aiModel,
                      })
                    }
                  } catch {}
                }

                if (targetTerm) {
                  const match = targetCats.find(c => c.name === targetTerm)
                  if (match) mappedCats.push({ id: match.id })
                }
              }
            }
            if (mappedCats.length) { payload.categories = mappedCats; syncedFields.categories = mappedCats.length }
          }

          if (field === 'attributes' && sourceProduct.attributes?.length && aiEnabled && geminiKey) {
            let targetAttrs = []
            try { targetAttrs = await wooGet(targetShop, 'products/attributes?per_page=100') } catch {}

            const mappedAttrs = []
            for (const attr of sourceProduct.attributes) {
              const targetAttr = targetAttrs.find(a => a.slug === attr.slug)
              if (!targetAttr) continue

              let targetTerms = []
              try {
                const terms = await wooGet(targetShop, `products/attributes/${targetAttr.id}/terms?per_page=100`)
                targetTerms = terms.map(t => t.name)
              } catch {}

              const mappedValues = []
              for (const val of (attr.options || [])) {
                if (targetShop.locale === sourceShop.locale) {
                  if (targetTerms.includes(val)) mappedValues.push(val)
                } else {
                  const cacheKey = `${sourceShop.locale}:${targetShop.locale}:attribute:${attr.slug}:${val}`
                  const { data: cached } = await supabase.from('ai_translation_cache').select('target_term').eq('cache_key', cacheKey).maybeSingle()
                  let targetVal = cached?.target_term
                  if (!targetVal) {
                    try {
                      const result = await translateTerm(geminiKey, val, sourceShop.locale, targetShop.locale, targetTerms, aiModel)
                      if (result.confidence >= aiThreshold) {
                        targetVal = result.term
                        await supabase.from('ai_translation_cache').upsert({
                          cache_key: cacheKey, user_id: user.id,
                          source_locale: sourceShop.locale, target_locale: targetShop.locale,
                          field: 'attribute', source_term: val, target_term: targetVal,
                          confidence: result.confidence, model: aiModel,
                        })
                      }
                    } catch {}
                  }
                  if (targetVal) mappedValues.push(targetVal)
                }
              }
              if (mappedValues.length) {
                mappedAttrs.push({ id: targetAttr.id, name: targetAttr.name, visible: attr.visible, variation: attr.variation, options: mappedValues })
              }
            }
            if (mappedAttrs.length) { payload.attributes = mappedAttrs; syncedFields.attributes = mappedAttrs.length }
          }
        }

        // PUT to target WooCommerce
        if (Object.keys(payload).length > 0) {
          await wooPut(targetShop, `products/${targetProductId}`, payload)

          // Sync variations stock if requested
          if (fields.includes('stock_quantity') && sourceProduct.type === 'variable' && sourceVariations.length) {
            const targetVariations = await wooGet(targetShop, `products/${targetProductId}/variations?per_page=100`)
            for (const sv of sourceVariations) {
              const tv = targetVariations.find(v => v.sku === sv.sku)
              if (!tv) continue
              await wooPut(targetShop, `products/${targetProductId}/variations/${tv.id}`, {
                manage_stock: sv.manage_stock, stock_quantity: sv.stock_quantity, stock_status: sv.stock_status,
              })
            }
          }
        }

        results.push({ shop_id: conn.target_shop_id, shop_name: targetShop.name, ok: true, synced_fields: syncedFields })
        await log(supabase, 'info', `Product ${product_id} synced to ${targetShop.name}`, { user_id: user.id, source_shop_id, target_shop_id: conn.target_shop_id, fields, synced_fields: syncedFields })
      } catch (err) {
        results.push({ shop_id: conn.target_shop_id, ok: false, error: err.message })
        await log(supabase, 'error', `Sync failed for product ${product_id} to shop ${conn.target_shop_id}`, { user_id: user.id, error: err.message })
      }
    }

    return new Response(JSON.stringify({ ok: true, synced: results.filter(r => r.ok).length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await log(supabase, 'error', 'sync-products unhandled error', { error: err.message })
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/sync-products' }
