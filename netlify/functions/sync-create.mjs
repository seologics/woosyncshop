// netlify/functions/sync-create.mjs
// POST { source_shop_id, target_shop_id, products: [...], config: { language, translate_fields, rewrite_seo, tone, sku_mode, lang_code } }
// Creates products in target shop with AI translation, attribute preflight, EAN assignment, SKU generation

import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS })

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'sync-create', message, metadata: meta }) } catch {}
}

// ── WooCommerce helpers ───────────────────────────────────────────────────────
async function wooFetch(shop, endpoint, method = 'GET', body = null) {
  const base = shop.site_url.replace(/\/$/, '')
  const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  const opts = {
    method,
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
  }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)
  const res = await fetch(`${base}/wp-json/wc/v3/${endpoint}`, opts)
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(`WC ${method} ${endpoint} non-JSON: ${text.slice(0, 200)}`) }
}

// ── AI helper (Gemini + OpenAI support) ──────────────────────────────────────
async function callAI(settings, systemPrompt, userPrompt, timeoutMs = 25000) {
  const controller = new AbortController()
  const _timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const provider = settings?.content_provider || 'claude'

    // Claude (Anthropic)
    if (provider === 'claude') {
      const apiKey = Netlify.env.get('ANTHROPIC_API_KEY')
      if (!apiKey) throw new Error('No Anthropic API key configured')
      const model = settings?.claude_model_content || 'claude-haiku-4-5-20251001'
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 2000, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
      })
      if (!res.ok) { const e = await res.text(); throw new Error(`Claude error ${res.status}: ${e.slice(0, 200)}`) }
      return (await res.json()).content?.[0]?.text || '{}'
    }

    // OpenAI
    if (provider === 'openai') {
      const apiKey = settings?.openai_api_key || Netlify.env.get('OPENAI_API_KEY')
      if (!apiKey) throw new Error('No OpenAI API key configured')
      const model = settings?.openai_model_content || 'gpt-4o-mini'
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.4, response_format: { type: 'json_object' } }),
      })
      if (!res.ok) { const e = await res.text(); throw new Error(`OpenAI error ${res.status}: ${e.slice(0, 200)}`) }
      return (await res.json()).choices[0].message.content
    }

    // Gemini
    const geminiKey = settings?.gemini_api_key
    if (!geminiKey) throw new Error('No Gemini API key configured')
    const model = settings?.ai_model_translation || 'gemini-2.5-flash'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }], generationConfig: { temperature: 0.4 } }),
    })
    if (!res.ok) { const e = await res.text(); throw new Error(`Gemini error ${res.status}: ${e.slice(0, 200)}`) }
    return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  } finally {
    clearTimeout(_timer)
  }
}

function safeJSON(text) {
  try {
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(clean)
  } catch { return null }
}

// ── Detect SEO plugin on target shop ─────────────────────────────────────────
async function detectSeoPlugin(shop) {
  try {
    const status = await wooFetch(shop, 'system_status')
    const plugins = status?.active_plugins || []
    const pluginStrings = plugins.map(p => (p.plugin || p.name || '').toLowerCase())
    if (pluginStrings.some(p => p.includes('rank-math') || p.includes('rankmath'))) return 'rankmath'
    if (pluginStrings.some(p => p.includes('yoast') || p.includes('wordpress-seo'))) return 'yoast'
  } catch {}
  return null
}

// ── Attribute preflight: detect/create/translate attributes on target ─────────
async function attributePreflight(sourceAttrs, targetShop, settings, targetLanguage, tone) {
  // Get existing attributes on target
  let targetAttrs = []
  try { targetAttrs = await wooFetch(targetShop, 'products/attributes?per_page=100') } catch {}
  
  const targetAttrMap = {} // slug → { id, name }
  for (const a of (Array.isArray(targetAttrs) ? targetAttrs : [])) {
    targetAttrMap[a.slug] = { id: a.id, name: a.name }
  }

  const attrIdMap = {} // source attr name → target attr id

  for (const attr of sourceAttrs) {
    const slug = attr.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    if (targetAttrMap[slug]) {
      attrIdMap[attr.name] = targetAttrMap[slug].id
      continue
    }

    // Translate attribute name
    let translatedName = attr.name
    try {
      const raw = await callAI(settings,
        `You are a WooCommerce product attribute translator. Return ONLY valid JSON, no markdown.`,
        `Translate this WooCommerce attribute name to ${targetLanguage}. Tone: ${tone}.\nAttribute: "${attr.name}"\nReturn: {"translated": "..."}`
      )
      const parsed = safeJSON(raw)
      if (parsed?.translated) translatedName = parsed.translated
    } catch {}

    // Create attribute on target
    try {
      const created = await wooFetch(targetShop, 'products/attributes', 'POST', {
        name: translatedName,
        slug,
        type: 'select',
        order_by: 'menu_order',
        has_archives: false,
      })
      if (created?.id) {
        attrIdMap[attr.name] = created.id
        // Create attribute terms
        const terms = attr.options || []
        for (const term of terms) {
          let translatedTerm = term
          try {
            const raw = await callAI(settings,
              `Translate product attribute values to ${targetLanguage}. Return ONLY valid JSON.`,
              `Attribute: "${translatedName}". Translate value: "${term}"\nReturn: {"translated": "..."}`
            )
            const parsed = safeJSON(raw)
            if (parsed?.translated) translatedTerm = parsed.translated
          } catch {}
          try {
            await wooFetch(targetShop, `products/attributes/${created.id}/terms`, 'POST', { name: translatedTerm })
          } catch {}
        }
      }
    } catch {}
  }

  return attrIdMap
}

// ── SKU generation ────────────────────────────────────────────────────────────
async function generateSku(mode, product, langCode, supabase, targetShopId) {
  if (mode === 'lang_prefix') {
    const base = product.sku || `PROD-${product.id}`
    return `${langCode.toUpperCase()}-${base}`
  }

  if (mode === 'lang_random') {
    const rand = Math.floor(1000000 + Math.random() * 9000000)
    return `${langCode.toUpperCase()}-${rand}`
  }

  if (mode === 'category_initials') {
    // Get primary category name
    const cats = product.categories || []
    const primaryCat = cats.find(c => c.is_primary) || cats[0]
    if (!primaryCat?.name) {
      // Fallback to lang_random
      const rand = Math.floor(1000 + Math.random() * 9000)
      return `PROD-${rand}`
    }

    // Build initials from category name words
    const words = primaryCat.name.trim().split(/\s+/).filter(Boolean)
    const prefix = words.map(w => w[0].toUpperCase()).join('')

    // Fetch or create counter for this prefix+shop
    const { data: counter } = await supabase
      .from('sku_prefix_counters')
      .select('next_number')
      .eq('shop_id', targetShopId)
      .eq('prefix', prefix)
      .single()

    const nextNum = counter?.next_number ?? 1001
    const sku = `${prefix}-${nextNum}`

    // Upsert incremented counter
    await supabase.from('sku_prefix_counters').upsert({
      shop_id: targetShopId,
      prefix,
      next_number: nextNum + 1,
    }, { onConflict: 'shop_id,prefix' })

    return sku
  }

  if (mode === 'identifier') {
    // Use source product SKU or ID as identifier value
    return product.sku || `ID-${product.id}`
  }

  return product.sku || `PROD-${product.id}`
}

// ── Main handler ─────────────────────────────────────────────────────────────
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

  const { source_shop_id, target_shop_id, products: sourceProducts, config: cfg } = body
  if (!source_shop_id || !target_shop_id || !Array.isArray(sourceProducts) || sourceProducts.length === 0) {
    return json({ error: 'source_shop_id, target_shop_id, products[] required' }, 400)
  }

  const {
    language = 'Dutch',
    translate_fields = ['name', 'description', 'short_description', 'attributes'],
    rewrite_seo = true,
    tone = 'formal',
    sku_mode = 'lang_prefix',
    lang_code = 'NL',
    translate_meta = true,
  } = cfg || {}

  try {
    const [{ data: sourceShop }, { data: targetShop }] = await Promise.all([
      supabase.from('shops').select('*').eq('id', source_shop_id).eq('user_id', user.id).single(),
      supabase.from('shops').select('*').eq('id', target_shop_id).eq('user_id', user.id).single(),
    ])
    if (!sourceShop || !targetShop) return json({ error: 'Shop not found' }, 404)

    const { data: platformSettings } = await supabase.from('platform_settings').select('*').eq('id', 1).single()

    const seoPlugin = await detectSeoPlugin(targetShop)
    await log(supabase, 'info', `Sync create started: ${sourceProducts.length} products → ${targetShop.name} (${language})`, { user_id: user.id, source_shop_id, target_shop_id })

    const results = { created: [], failed: [], skipped: [] }

    // ── Collect all unique attributes for preflight ───────────────────────────
    const allSourceAttrs = []
    const seenAttrNames = new Set()
    for (const p of sourceProducts) {
      for (const attr of (p.attributes || [])) {
        if (!seenAttrNames.has(attr.name)) {
          seenAttrNames.add(attr.name)
          allSourceAttrs.push(attr)
        }
      }
    }

    // Run attribute preflight once for all products
    const attrIdMap = await attributePreflight(allSourceAttrs, targetShop, platformSettings, language, tone)

    // ── Process each product (concurrency-limited to 3 parallel AI calls) ──────
    // Cap at 200 products per call to prevent timeout; caller should batch if needed
    const PRODUCT_CAP = 200
    const toProcess = sourceProducts.slice(0, PRODUCT_CAP)
    if (sourceProducts.length > PRODUCT_CAP) {
      await log(supabase, 'warn', `sync-create: capped at ${PRODUCT_CAP} (received ${sourceProducts.length})`, { user_id: user.id })
    }

    // Process 3 products concurrently — each needs 1 AI call + 1 WC write
    const CONCURRENCY = 3
    const productQueue = [...toProcess]

    async function processOne(sourceProd) {
      try {
        // ── 1. AI translate + rewrite ───────────────────────────────────────
        const translateFields = translate_fields.filter(f => sourceProd[f] != null || f === 'name')
        const fieldsToTranslate = {}
        for (const f of translateFields) {
          if (f === 'name') fieldsToTranslate.name = sourceProd.name
          if (f === 'description') fieldsToTranslate.description = sourceProd.description?.replace(/<[^>]+>/g, '').slice(0, 1000) || ''
          if (f === 'short_description') fieldsToTranslate.short_description = sourceProd.short_description?.replace(/<[^>]+>/g, '').slice(0, 500) || ''
          if (f === 'attributes') {
            fieldsToTranslate.attribute_values = {}
            for (const attr of (sourceProd.attributes || [])) {
              fieldsToTranslate.attribute_values[attr.name] = attr.options || []
            }
          }
        }

        const systemPrompt = `You are an expert WooCommerce product content writer and translator.
Translate and ${rewrite_seo ? 'rewrite for optimal SEO in' : 'localize to'} ${language}.
Tone: ${tone}. Do NOT do a literal word-for-word translation — adapt naturally for the target market.
Also generate an SEO-optimized meta_title (max 60 chars) and meta_description (max 160 chars) in ${language}.
Return ONLY valid JSON, no markdown.`

        const userPrompt = `Product to translate/rewrite:
Name: ${sourceProd.name}
${fieldsToTranslate.description ? `Description: ${fieldsToTranslate.description}` : ''}
${fieldsToTranslate.short_description ? `Short description: ${fieldsToTranslate.short_description}` : ''}
${fieldsToTranslate.attribute_values ? `Attribute values: ${JSON.stringify(fieldsToTranslate.attribute_values)}` : ''}

Return JSON: {
  "name": "translated name",
  "description": "translated/rewritten description (can include simple HTML like <p>, <ul>, <li>)",
  "short_description": "translated short description",
  "meta_title": "SEO meta title max 60 chars",
  "meta_description": "SEO meta description max 160 chars",
  "attribute_values": { "attr_name": ["translated", "values"] }
}`

        let translated = {}
        try {
          const raw = await callAI(platformSettings, systemPrompt, userPrompt)
          translated = safeJSON(raw) || {}
        } catch (aiErr) {
          await log(supabase, 'warn', `AI translate failed for ${sourceProd.name}: ${aiErr.message}`, { user_id: user.id })
          // Continue with original values if AI fails
          translated = {
            name: sourceProd.name,
            description: sourceProd.description || '',
            short_description: sourceProd.short_description || '',
          }
        }

        // ── 2. SKU generation ───────────────────────────────────────────────
        const newSku = await generateSku(sku_mode, sourceProd, lang_code, supabase, target_shop_id)

        // ── 3. Build attributes for target ──────────────────────────────────
        const targetAttributes = []
        for (const attr of (sourceProd.attributes || [])) {
          const targetAttrId = attrIdMap[attr.name]
          const translatedValues = translated.attribute_values?.[attr.name] || attr.options || []

          const attrPayload = {
            name: attr.name,
            visible: attr.visible !== false,
            variation: attr.variation || false,
            options: translatedValues,
          }
          if (targetAttrId) attrPayload.id = targetAttrId
          targetAttributes.push(attrPayload)
        }

        // If sku_mode is 'identifier', add hidden _wss_identifier attribute
        if (sku_mode === 'identifier') {
          const identifierVal = sourceProd.sku || String(sourceProd.id)
          targetAttributes.push({
            name: 'identifier',
            visible: false,
            variation: false,
            options: [identifierVal],
          })
        }

        // ── 4. Build product payload ─────────────────────────────────────────
        const meta_data = []

        // SEO meta fields
        if (translate_meta && translated.meta_title) {
          if (seoPlugin === 'rankmath') {
            meta_data.push({ key: 'rank_math_title', value: translated.meta_title })
            meta_data.push({ key: 'rank_math_description', value: translated.meta_description || '' })
          } else if (seoPlugin === 'yoast') {
            meta_data.push({ key: '_yoast_wpseo_title', value: translated.meta_title })
            meta_data.push({ key: '_yoast_wpseo_metadesc', value: translated.meta_description || '' })
          }
          // Store regardless so it's available even without SEO plugin detection
          meta_data.push({ key: '_wss_meta_title', value: translated.meta_title })
          meta_data.push({ key: '_wss_meta_description', value: translated.meta_description || '' })
        }

        // Identifier meta field
        if (sku_mode === 'identifier') {
          meta_data.push({ key: '_wss_identifier', value: sourceProd.sku || String(sourceProd.id) })
        }

        // Copy WQM meta if present in source
        const wqmKeys = ['_wqm_tiers', '_wqm_settings', '_wqm_min_quantity', '_wqm_max_quantity', '_wqm_step', '_wqm_group_of']
        for (const wqmKey of wqmKeys) {
          const wqmMeta = sourceProd.meta_data?.find(m => m.key === wqmKey)
          if (wqmMeta) meta_data.push({ key: wqmKey, value: wqmMeta.value })
        }

        // Translate categories (use source slugs, WooCommerce will create if needed)
        const categories = (sourceProd.categories || []).map(c => ({ id: c.id, name: c.name, slug: c.slug }))

        const productPayload = {
          name: translate_fields.includes('name') ? (translated.name || sourceProd.name) : sourceProd.name,
          status: 'draft', // created as draft — user can publish from dashboard
          type: sourceProd.type || 'simple',
          sku: newSku,
          regular_price: String(sourceProd.regular_price || sourceProd.price || ''),
          description: translate_fields.includes('description') ? (translated.description || sourceProd.description || '') : (sourceProd.description || ''),
          short_description: translate_fields.includes('short_description') ? (translated.short_description || sourceProd.short_description || '') : (sourceProd.short_description || ''),
          manage_stock: sourceProd.manage_stock || false,
          stock_quantity: sourceProd.stock_quantity ?? null,
          stock_status: sourceProd.stock_status || 'instock',
          attributes: targetAttributes,
          categories,
          meta_data,
        }

        // ── 5. Create product on target shop ────────────────────────────────
        const created = await wooFetch(targetShop, 'products', 'POST', productPayload)

        if (!created?.id) {
          results.failed.push({ source_id: sourceProd.id, name: sourceProd.name, error: created?.message || 'Unknown WC error' })
          return
        }

        // ── 6. EAN assignment ───────────────────────────────────────────────
        let assignedEan = null
        try {
          // Call ean-assign internal (reuse the RPC directly)
          const { data: ean } = await supabase.rpc('assign_next_ean', {
            p_sku: newSku,
            p_product_id: created.id,
          })
          if (ean) {
            assignedEan = ean
            // Write EAN to product meta (_wc_gtin is WooCommerce standard)
            await wooFetch(targetShop, `products/${created.id}`, 'PUT', {
              meta_data: [{ key: '_wc_gtin', value: ean }],
            })
          }
        } catch (eanErr) {
          await log(supabase, 'warn', `EAN assign failed for SKU ${newSku}: ${eanErr.message}`, { user_id: user.id })
        }

        // ── 7. Store mapping in shop_product_mappings ───────────────────────
        try {
          await supabase.from('shop_product_mappings').insert({
            user_id: user.id,
            source_shop_id,
            target_shop_id,
            source_sku: sourceProd.sku || '',
            target_sku: newSku,
            source_woo_id: sourceProd.id,
            target_woo_id: created.id,
            match_method: 'created',
          })
        } catch {}

        results.created.push({
          source_id: sourceProd.id,
          source_name: sourceProd.name,
          target_id: created.id,
          target_name: translated.name || sourceProd.name,
          target_sku: newSku,
          ean: assignedEan,
          status: 'draft',
        })

      } catch (productErr) {
        results.failed.push({
          source_id: sourceProd.id,
          name: sourceProd.name,
          error: productErr.message,
        })
        await log(supabase, 'error', `Sync create product failed: ${sourceProd.name} — ${productErr.message}`, { user_id: user.id })
      }
    }

    // Drain the queue with limited concurrency
    async function worker() {
      while (productQueue.length > 0) {
        const prod = productQueue.shift()
        if (prod) await processOne(prod)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toProcess.length) }, worker))

    await log(supabase, 'info', `Sync create complete: ${results.created.length} created, ${results.failed.length} failed`, {
      user_id: user.id, source_shop_id, target_shop_id,
    })

    return json({
      ok: true,
      created: results.created,
      failed: results.failed,
      skipped: results.skipped,
      seo_plugin: seoPlugin,
    })

  } catch (err) {
    await log(supabase, 'error', `Sync create fatal error: ${err.message}`, { user_id: user.id })
    return json({ error: err.message }, 500)
  }
}

export const config = { path: '/api/sync-create', timeout: 26 }
