// netlify/functions/sync-create-background.mjs
// Background function — runs up to 15 min, no timeout.
// POST { source_shop_id, target_shop_id, products, config, job_id }
// Returns 202 immediately, does work async, writes progress to sync_jobs table.
// Poll /api/sync-job-status?id=<job_id> for progress.

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
async function attributePreflight(sourceAttrs, targetShop, settings, targetLanguage, tone, supabase, userId, sourceLocale, targetLocale) {
  let targetAttrs = []
  try { targetAttrs = await wooFetch(targetShop, 'products/attributes?per_page=100') } catch {}

  const targetAttrMap = {}
  for (const a of (Array.isArray(targetAttrs) ? targetAttrs : [])) {
    targetAttrMap[a.slug] = { id: a.id, name: a.name }
  }

  const attrIdMap = {}
  const toTranslate = [] // attrs not already on target

  for (const attr of sourceAttrs) {
    const slug = attr.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (targetAttrMap[slug]) {
      attrIdMap[attr.name] = targetAttrMap[slug].id
    } else {
      toTranslate.push({ ...attr, slug })
    }
  }

  if (toTranslate.length === 0) return attrIdMap

  // ── Check translation cache ───────────────────────────────────────────────
  const cacheMap = {} // source term → translated term
  if (supabase && userId) {
    try {
      const allTerms = toTranslate.flatMap(a => [a.name, ...(a.options || [])])
      const { data: cached } = await supabase
        .from('ai_taxonomy_cache')
        .select('source_term, target_term')
        .eq('user_id', userId)
        .eq('source_locale', sourceLocale || 'nl_NL')
        .eq('target_locale', targetLocale || 'de_DE')
        .in('source_term', allTerms)
      for (const row of (cached || [])) cacheMap[row.source_term] = row.target_term
    } catch {}
  }

  // ── ONE batch AI call for everything not in cache ─────────────────────────
  const batchInput = toTranslate
    .filter(a => !cacheMap[a.name] || (a.options || []).some(t => !cacheMap[t]))
    .map(a => ({ attribute: a.name, terms: (a.options || []).filter(t => !cacheMap[t]) }))

  if (batchInput.length > 0) {
    try {
      const raw = await callAI(settings,
        `You are a WooCommerce product taxonomy translator. Return ONLY valid JSON matching the exact structure.`,
        `Translate each attribute name and its terms to ${targetLanguage} (tone: ${tone}).
Input: ${JSON.stringify(batchInput)}
Return this exact JSON structure:
{"translations":[{"attribute":"translated name","terms":["translated term 1"]}]}`)
      const parsed = safeJSON(raw)
      const cacheInserts = []
      for (let i = 0; i < batchInput.length; i++) {
        const src = batchInput[i]
        const trl = (parsed?.translations || [])[i] || {}
        if (trl.attribute) {
          cacheMap[src.attribute] = trl.attribute
          cacheInserts.push({ user_id: userId, source_locale: sourceLocale || 'nl_NL', target_locale: targetLocale || 'de_DE', field_type: 'attribute', source_term: src.attribute, target_term: trl.attribute, confidence: 0.9, model: 'batch', use_count: 1 })
        }
        for (let j = 0; j < src.terms.length; j++) {
          const translated = (trl.terms || [])[j]
          if (translated) {
            cacheMap[src.terms[j]] = translated
            cacheInserts.push({ user_id: userId, source_locale: sourceLocale || 'nl_NL', target_locale: targetLocale || 'de_DE', field_type: 'attribute_term', source_term: src.terms[j], target_term: translated, confidence: 0.9, model: 'batch', use_count: 1 })
          }
        }
      }
      if (supabase && cacheInserts.length) {
        supabase.from('ai_taxonomy_cache').upsert(cacheInserts, { onConflict: 'user_id,source_locale,target_locale,field_type,source_term' }).catch(() => {})
      }
    } catch {} // If AI fails, fall through using source names
  }

  // ── Create attributes + terms on target (parallel term writes) ────────────
  await Promise.all(toTranslate.map(async (attr) => {
    const translatedName = cacheMap[attr.name] || attr.name
    try {
      const created = await wooFetch(targetShop, 'products/attributes', 'POST', {
        name: translatedName, slug: attr.slug, type: 'select', order_by: 'menu_order', has_archives: false,
      })
      if (created?.id) {
        attrIdMap[attr.name] = created.id
        await Promise.all((attr.options || []).map(term =>
          wooFetch(targetShop, `products/attributes/${created.id}/terms`, 'POST', { name: cacheMap[term] || term }).catch(() => {})
        ))
      }
    } catch {}
  }))

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

// ── Image processing: download, generate SEO metadata, upload to target ─────
// mode: 'ai_vision' — Gemini scans image → SEO filename + alt + title in target language
// mode: 'translate' — uses translated product name, no vision call needed
async function processImages(sourceImages, targetShop, productName, language, imageMode, geminiKey, geminiModel) {
  if (!Array.isArray(sourceImages) || sourceImages.length === 0) return []

  const base = targetShop.site_url.replace(/\/$/, '')
  const wpAuth = `Basic ${Buffer.from(`${targetShop.consumer_key}:${targetShop.consumer_secret}`).toString('base64')}`

  const nameSlug = productName.toLowerCase()
    .replace(/[äàáâã]/g, 'a').replace(/[ëèéê]/g, 'e').replace(/[ïìíî]/g, 'i')
    .replace(/[öòóô]/g, 'o').replace(/[üùúû]/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

  const results = []

  for (let i = 0; i < sourceImages.length; i++) {
    const img = sourceImages[i]
    if (!img?.src) continue
    try {
      // 1. Download source image
      const fetchRes = await fetch(img.src, { signal: AbortSignal.timeout(10000) })
      if (!fetchRes.ok) throw new Error(`Fetch failed: ${fetchRes.status}`)
      const contentType = fetchRes.headers.get('content-type') || 'image/jpeg'
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
      const imageBuffer = await fetchRes.arrayBuffer()

      let seoFilename, altText, titleText

      // 2a. AI Vision mode: Gemini scans image → SEO metadata in target language
      if (imageMode === 'ai_vision' && geminiKey) {
        try {
          const b64 = Buffer.from(imageBuffer).toString('base64')
          const vRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel || 'gemini-2.5-flash'}:generateContent?key=${geminiKey}`,
            {
              method: 'POST', signal: AbortSignal.timeout(12000),
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [
                  { text: `SEO expert for a plant nursery webshop. Analyze this product image. Return ONLY valid JSON in ${language}:
{"filename":"seo-slug-max-60-chars-lowercase-hyphens-describe-species-pot-size-height","alt":"max 12 word descriptive alt text","title":"max 8 word image title"}` },
                  { inline_data: { mime_type: contentType, data: b64 } }
                ]}],
                generationConfig: { temperature: 0.2 }
              })
            }
          )
          if (vRes.ok) {
            const vData = await vRes.json()
            const raw = vData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
            const parsed = JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
            if (parsed.filename) seoFilename = parsed.filename.replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '').slice(0, 60)
            if (parsed.alt)   altText   = parsed.alt
            if (parsed.title) titleText = parsed.title
          }
        } catch {} // Fall through to translate mode
      }

      // 2b. Translate mode (or fallback)
      if (!seoFilename) {
        seoFilename = i === 0 ? nameSlug : `${nameSlug}-${i + 1}`
        altText     = altText || (i === 0 ? productName : `${productName} ${i + 1}`)
        titleText   = titleText || productName
      }

      const uid = Math.random().toString(36).slice(2, 6)
      const filename = `${seoFilename}-${uid}.${ext}`

      // 3. Upload to WordPress media library
      const uploadRes = await fetch(`${base}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: {
          'Authorization': wpAuth,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': contentType,
        },
        body: imageBuffer,
      })
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`)
      const media = await uploadRes.json()

      // 4. Set alt text + title on the media item
      fetch(`${base}/wp-json/wp/v2/media/${media.id}`, {
        method: 'POST',
        headers: { 'Authorization': wpAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt_text: altText, title: titleText, caption: '' }),
      }).catch(() => {})

      results.push({ id: media.id, src: media.source_url, alt: altText, name: titleText })
    } catch (imgErr) {
      // Fallback: pass src URL for WC to sideload (no SEO metadata)
      results.push({ src: img.src, alt: img.alt || productName, name: productName, fallback: true })
    }
  }

  return results
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

  const { source_shop_id, target_shop_id, products: sourceProducts, config: cfg, job_id } = body
  if (!source_shop_id || !target_shop_id || !Array.isArray(sourceProducts) || sourceProducts.length === 0) {
    return json({ error: 'source_shop_id, target_shop_id, products[] required' }, 400)
  }
  if (!job_id) return json({ error: 'job_id required' }, 400)

  const {
    language = 'Dutch',
    translate_fields = ['name', 'description', 'short_description', 'attributes'],
    rewrite_seo = true,
    tone = 'formal',
    sku_mode = 'lang_prefix',
    lang_code = 'NL',
    translate_meta = true,
    image_mode = 'translate', // 'translate' | 'ai_vision'
  } = cfg || {}

  // ── Background function: runs to completion (up to 15 min), returns 202 ──
  // Netlify background functions execute the full async body synchronously.
  // No fire-and-forget needed — just write progress to sync_jobs as we go.
  try {
    const [{ data: sourceShop }, { data: targetShop }] = await Promise.all([
      supabase.from('shops').select('*').eq('id', source_shop_id).eq('user_id', user.id).single(),
      supabase.from('shops').select('*').eq('id', target_shop_id).eq('user_id', user.id).single(),
    ])
    if (!sourceShop || !targetShop) {
      await supabase.from('sync_jobs').update({ status: 'failed', error: 'Shop not found', updated_at: new Date().toISOString() }).eq('id', job_id)
      return
    }

    const { data: platformSettings } = await supabase.from('platform_settings').select('*').eq('id', 1).single()

    const seoPlugin = await detectSeoPlugin(targetShop)
    const geminiKey   = platformSettings?.gemini_api_key || null
    const geminiModel = platformSettings?.ai_model_image || 'gemini-2.5-flash'
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
    const attrIdMap = await attributePreflight(allSourceAttrs, targetShop, platformSettings, language, tone, supabase, user.id, sourceShop.locale, targetShop.locale)

    // ── Process each product ─────────────────────────────────────────────────
    // Frontend sends one product at a time to avoid 26s timeout.
    // Function handles 1-N but is optimised for 1.
    async function processOne(sourceProd) {
      try {
        // ── 1. AI translate (keep prompt small: name + short desc only, max 400 chars description)
        // SEO meta is generated in a separate lightweight call after product creation.
        const fieldsToTranslate = {}
        if (translate_fields.includes('name')) fieldsToTranslate.name = sourceProd.name
        if (translate_fields.includes('description') && sourceProd.description)
          fieldsToTranslate.description = sourceProd.description.replace(/<[^>]+>/g, '').slice(0, 400)
        if (translate_fields.includes('short_description') && sourceProd.short_description)
          fieldsToTranslate.short_description = sourceProd.short_description.replace(/<[^>]+>/g, '').slice(0, 200)
        if (translate_fields.includes('attributes')) {
          fieldsToTranslate.attribute_values = {}
          for (const attr of (sourceProd.attributes || [])) {
            fieldsToTranslate.attribute_values[attr.name] = attr.options || []
          }
        }

        const systemPrompt = `Translate WooCommerce product content to ${language}. Tone: ${tone}. Return ONLY valid JSON, no markdown, no explanation.`
        const userPrompt = `Translate: ${JSON.stringify(fieldsToTranslate)}
Return JSON with same keys and translated values. For description/short_description you may expand the translated text naturally.`

        let translated = {}
        try {
          const raw = await callAI(platformSettings, systemPrompt, userPrompt, 18000)
          translated = safeJSON(raw) || {}
        } catch (aiErr) {
          await log(supabase, 'warn', `AI translate failed for ${sourceProd.name}: ${aiErr.message}`, { user_id: user.id })
          translated = { name: sourceProd.name }
        }

        // ── 2. Image processing: download + SEO metadata + upload to target ───────
        const translatedProductName = translated.name || sourceProd.name
        const processedImages = await processImages(
          sourceProd.images || [],
          targetShop,
          translatedProductName,
          language,
          image_mode,
          geminiKey,
          geminiModel
        )

        // ── 3. SKU generation ───────────────────────────────────────────────
        const newSku = await generateSku(sku_mode, sourceProd, lang_code, supabase, target_shop_id)

        // ── 4. Build attributes for target ──────────────────────────────────
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

        // ── 5. Build product payload ─────────────────────────────────────────
        const meta_data = []

        // SEO meta written async after product creation (see step 6 above)

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
          images: processedImages.length > 0 ? processedImages.map(img => ({
            src: img.src,
            ...(img.id ? { id: img.id } : {}),
            alt: img.alt || '',
            name: img.name || '',
          })) : undefined,
          attributes: targetAttributes,
          categories,
          meta_data,
        }

        // ── 6. Create product on target shop ────────────────────────────────
        const created = await wooFetch(targetShop, 'products', 'POST', productPayload)

        if (!created?.id) {
          results.failed.push({ source_id: sourceProd.id, name: sourceProd.name, error: created?.message || 'Unknown WC error' })
          return
        }

        // ── 7. SEO meta (fire-and-forget — doesn't block product creation) ──────
        if (translate_meta && rewrite_seo) {
          ;(async () => {
            try {
              const seoRaw = await callAI(platformSettings,
                `Generate SEO meta for a WooCommerce product. Return ONLY valid JSON.`,
                `Product name: "${translated.name || sourceProd.name}"
Short description: "${(translated.short_description || sourceProd.short_description || '').slice(0, 120)}"
Language: ${language}. Tone: ${tone}.
Return: {"meta_title":"max 60 chars","meta_description":"max 160 chars"}`,
                10000
              )
              const seoData = safeJSON(seoRaw)
              if (seoData?.meta_title) {
                const seoMeta = [
                  { key: '_wss_meta_title', value: seoData.meta_title },
                  { key: '_wss_meta_description', value: seoData.meta_description || '' },
                ]
                if (seoPlugin === 'rankmath') {
                  seoMeta.push({ key: 'rank_math_title', value: seoData.meta_title })
                  seoMeta.push({ key: 'rank_math_description', value: seoData.meta_description || '' })
                } else if (seoPlugin === 'yoast') {
                  seoMeta.push({ key: '_yoast_wpseo_title', value: seoData.meta_title })
                  seoMeta.push({ key: '_yoast_wpseo_metadesc', value: seoData.meta_description || '' })
                }
                await wooFetch(targetShop, `products/${created.id}`, 'PUT', { meta_data: seoMeta })
              }
            } catch {} // Non-critical — product already created
          })()
        }

        // ── 8. EAN assignment ───────────────────────────────────────────────
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

        // ── 9. Store mapping in shop_product_mappings ───────────────────────
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

    for (let i = 0; i < sourceProducts.length; i++) {
      const prod = sourceProducts[i]
      // Update job progress before each product
      await supabase.from('sync_jobs').update({
        status: 'running',
        done: i,
        total: sourceProducts.length,
        current_product: prod.name,
        updated_at: new Date().toISOString(),
      }).eq('id', job_id)
      await log(supabase, 'info', `Sync create product ${i+1}/${sourceProducts.length}: ${prod.name}`, { user_id: user.id, job_id })
      await processOne(prod)
      // Update progress after each product completes
      await supabase.from('sync_jobs').update({
        done: i + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', job_id)
    }

    await log(supabase, 'info', `Sync create complete: ${results.created.length} created, ${results.failed.length} failed`, {
      user_id: user.id, source_shop_id, target_shop_id,
    })

    // Write final result to sync_jobs
    await supabase.from('sync_jobs').update({
      status: 'done',
      done: sourceProducts.length,
      total: sourceProducts.length,
      current_product: null,
      result: { created: results.created, failed: results.failed, skipped: results.skipped, seo_plugin: seoPlugin },
      updated_at: new Date().toISOString(),
    }).eq('id', job_id)

  } catch (err) {
    await log(supabase, 'error', `Sync create fatal error: ${err.message}`, { user_id: user.id })
    try {
      await supabase.from('sync_jobs').update({
        status: 'failed', error: err.message, updated_at: new Date().toISOString()
      }).eq('id', job_id)
    } catch {}
  }
  // Background function returns 202 after all work is done
  return new Response(JSON.stringify({ ok: true, job_id }), { status: 202, headers: CORS })
}

export const config = { path: '/api/sync-create' }
// NOTE: Deploy this file as sync-create-background.mjs for Netlify background function runtime
