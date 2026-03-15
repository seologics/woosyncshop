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
async function callAI(settings, systemPrompt, userPrompt, timeoutMs = 25000, maxTokens = 800) {
  const controller = new AbortController()
  const _timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const provider = settings?.content_provider || 'gemini'

    // ── Claude (Anthropic) ────────────────────────────────────────────────────
    if (provider === 'claude') {
      const apiKey = Netlify.env.get('ANTHROPIC_API_KEY')
      if (!apiKey) {
        // ANTHROPIC_API_KEY not configured — fall through to Gemini automatically
        // so product creation doesn't silently fail due to a missing env var
      } else {
        const model = settings?.claude_model_content || 'claude-haiku-4-5-20251001'
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
        })
        if (!res.ok) { const e = await res.text(); throw new Error(`Claude error ${res.status}: ${e.slice(0, 200)}`) }
        return (await res.json()).content?.[0]?.text || '{}'
      }
    }

    // ── OpenAI ────────────────────────────────────────────────────────────────
    if (provider === 'openai') {
      const apiKey = settings?.openai_api_key || Netlify.env.get('OPENAI_API_KEY')
      if (!apiKey) {
        // Fall through to Gemini
      } else {
        const model = settings?.openai_model_content || 'gpt-4o-mini'
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.4, response_format: { type: 'json_object' } }),
        })
        if (!res.ok) { const e = await res.text(); throw new Error(`OpenAI error ${res.status}: ${e.slice(0, 200)}`) }
        return (await res.json()).choices[0].message.content
      }
    }

    // ── Gemini (default / fallback for all providers without a configured key) ─
    const geminiKey = settings?.gemini_api_key
    if (!geminiKey) throw new Error('Geen AI API key geconfigureerd. Voer een Gemini API key in bij Platform instellingen.')
    const model = settings?.ai_model_translation || 'gemini-2.5-flash'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
      }),
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

// ── Tier plugin detection + WQM ↔ WPC PBQ conversion ─────────────────────────
function detectTierPlugin(activePlugins = []) {
  const ids = Array.isArray(activePlugins) ? activePlugins : []
  if (ids.includes('wqm') || ids.includes('woocommerce-quantity-manager')) return 'wqm'
  if (ids.includes('wpc_pbq') || ids.includes('wpc-price-by-quantity-for-woocommerce')) return 'wpcpq'
  return null
}

function detectTierPluginFromMeta(metaData = []) {
  const keys = (metaData || []).map(m => m.key)
  if (keys.includes('_wqm_tiers')) return 'wqm'
  if (keys.includes('wpcpq_prices')) return 'wpcpq'
  return null
}

function parseMeta(value) {
  if (!value) return null
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

// WQM _wqm_tiers → WPC PBQ wpcpq_prices
// WQM:    { type: 'fixed'|'percent', tiers: { '0': { qty, amt }, ... } }
// WPC PBQ: [ { qty, price: '9.99'|'', discount: '10'|'' }, ... ]
function wqmToWpcpq(wqmMeta, markupPct = 0) {
  if (!wqmMeta) return null
  const raw = wqmMeta.tiers
    ? (Array.isArray(wqmMeta.tiers) ? wqmMeta.tiers : Object.values(wqmMeta.tiers))
    : []
  if (!raw.length) return null
  const tierType = wqmMeta.type || 'fixed'
  const factor   = 1 + markupPct / 100
  const prices = raw.map(t => {
    const qty = Number(t.qty) || 1
    if (tierType === 'percent') return { qty, price: '', discount: String(t.amt ?? '') }
    const n     = parseFloat(String(t.amt ?? '0').replace(',', '.')) || 0
    const final = markupPct !== 0 ? Math.round(n * factor * 100) / 100 : n
    return { qty, price: String(final), discount: '' }
  })
  return prices
}

// WPC PBQ wpcpq_prices → WQM _wqm_tiers
function wpcpqToWqm(wpcpqMeta, markupPct = 0) {
  if (!Array.isArray(wpcpqMeta) || !wpcpqMeta.length) return null
  const factor = 1 + markupPct / 100
  const firstWithPrice = wpcpqMeta.find(t => t.price && String(t.price).trim() !== '')
  const tierType = firstWithPrice ? 'fixed' : 'percent'
  const tiersObj = {}
  wpcpqMeta.forEach((t, i) => {
    const qty = Number(t.qty) || 1
    if (tierType === 'fixed' && t.price && String(t.price).trim() !== '') {
      const n     = parseFloat(String(t.price).replace(',', '.')) || 0
      const final = markupPct !== 0 ? Math.round(n * factor * 100) / 100 : n
      tiersObj[String(i)] = { qty, amt: String(final) }
    } else if (tierType === 'percent' && t.discount && String(t.discount).trim() !== '') {
      tiersObj[String(i)] = { qty, amt: String(t.discount) }
    } else {
      tiersObj[String(i)] = { qty, amt: String(t.price || t.discount || '0') }
    }
  })
  if (!Object.keys(tiersObj).length) return null
  return { type: tierType, tiers: tiersObj }
}

// ── Smart attribute + category mapping ────────────────────────────────────────
// Replaces simple slug-match with full AI reasoning:
//   1. Fetch all target attributes WITH their existing terms
//   2. Fetch all target categories  
//   3. Fetch 3 similar products from target shop for context
//   4. One AI call: match source attrs→target attrs, reuse/add values, assign categories
//   5. Execute: reuse existing IDs, add missing terms, create new attrs only if needed
//
// Returns: { attrResults: [{source_name, target_id, target_name, options}], categoryIds: [] }
async function smartMapping(sourceProd, targetShop, settings, targetLanguage, tone, supabase, userId, sourceLocale, targetLocale) {
  // ── 1. Fetch full target attribute catalog with terms ───────────────────────
  let targetAttrs = []
  try { targetAttrs = await wooFetch(targetShop, 'products/attributes?per_page=100') } catch {}

  // Fetch terms for each attribute in parallel (cap at 20 to avoid overload)
  const targetAttrsWithTerms = await Promise.all(
    (Array.isArray(targetAttrs) ? targetAttrs.slice(0, 40) : []).map(async (a) => {
      try {
        const terms = await wooFetch(targetShop, `products/attributes/${a.id}/terms?per_page=100`)
        return { id: a.id, name: a.name, slug: a.slug, terms: Array.isArray(terms) ? terms.map(t => ({ id: t.id, name: t.name })) : [] }
      } catch { return { id: a.id, name: a.name, slug: a.slug, terms: [] } }
    })
  )

  // ── 2. Fetch target categories ─────────────────────────────────────────────
  let targetCats = []
  try {
    const cats = await wooFetch(targetShop, 'products/categories?per_page=100&hide_empty=false')
    targetCats = Array.isArray(cats) ? cats.map(c => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parent })) : []
  } catch {}

  // ── 3. Find similar products on target for attribute value context ──────────
  // Search by first keyword of the source product name
  let similarProducts = []
  try {
    const keyword = sourceProd.name.split(/\s+/).slice(0, 3).join(' ')
    const found = await wooFetch(targetShop, `products?search=${encodeURIComponent(keyword)}&per_page=3&_fields=id,name,attributes,categories`)
    if (Array.isArray(found) && found.length > 0) {
      similarProducts = found.map(p => ({
        name: p.name,
        attributes: (p.attributes || []).map(a => ({ name: a.name, values: a.options || [] })),
        categories: (p.categories || []).map(c => c.name),
      }))
    }
  } catch {}

  // ── 4. Check cache for known translations ──────────────────────────────────
  const cacheMap = {}
  if (supabase && userId) {
    try {
      const allTerms = (sourceProd.attributes || []).flatMap(a => [a.name, ...(a.options || [])])
      const { data: cached } = await supabase
        .from('ai_taxonomy_cache').select('source_term, target_term')
        .eq('user_id', userId).eq('source_locale', sourceLocale || 'nl_NL').eq('target_locale', targetLocale || 'de_DE')
        .in('source_term', allTerms)
      for (const row of (cached || [])) cacheMap[row.source_term] = row.target_term
    } catch {}
  }

  // ── 5. Build AI prompt ─────────────────────────────────────────────────────
  const sourceAttrsSummary = (sourceProd.attributes || []).map(a => ({
    name: a.name,
    values: a.options || [],
  }))

  const targetAttrsSummary = targetAttrsWithTerms.map(a => ({
    id: a.id,
    name: a.name,
    existing_values: a.terms.map(t => ({ id: t.id, name: t.name })),
  }))

  const systemPrompt = `You are an expert WooCommerce product catalog manager specializing in cross-language product attribute mapping.
You match source product attributes to the correct existing attributes on a target shop, reuse existing values where possible, and only create new ones when truly needed.
You also assign the product to the most appropriate categories on the target shop.
Be precise and conservative: prefer reusing existing attributes/values over creating new ones.
Return ONLY valid JSON, no markdown, no explanation.`

  const userPrompt = `Source product: "${sourceProd.name}" (${sourceLocale} → ${targetLocale}, translate to ${targetLanguage})
Source categories: ${(sourceProd.categories || []).map(c => c.name).join(', ') || 'none'}

SOURCE ATTRIBUTES (need to be mapped to target):
${JSON.stringify(sourceAttrsSummary)}

TARGET SHOP EXISTING ATTRIBUTES (with their current values):
${JSON.stringify(targetAttrsSummary)}

TARGET SHOP CATEGORIES:
${JSON.stringify(targetCats.map(c => ({ id: c.id, name: c.name })))}

SIMILAR PRODUCTS ON TARGET SHOP (for attribute value reference):
${JSON.stringify(similarProducts)}

TASK:
1. For each source attribute, decide:
   a) Match to existing target attribute (by semantic meaning, even if different language/name)
   b) OR create a new attribute if no match exists
2. For each attribute's values:
   a) Reuse existing term IDs where the meaning matches
   b) Create new terms only for values that don't exist yet (translate to ${targetLanguage})
3. Assign this product to the most appropriate target categories (1-3 categories)

Return this exact JSON:
{
  "attributes": [
    {
      "source_name": "original source attribute name",
      "target_id": 123,
      "target_name": "matched/translated target attribute name",
      "target_slug": "slug",
      "is_new_attribute": false,
      "values": [
        { "term_id": 456, "name": "existing value name", "is_new": false },
        { "term_id": null, "name": "new value to create in ${targetLanguage}", "is_new": true }
      ]
    }
  ],
  "category_ids": [1, 2],
  "reasoning": "brief explanation of key decisions"
}`

  let aiResult = null
  try {
    const raw = await callAI(settings, systemPrompt, userPrompt, 20000)
    aiResult = safeJSON(raw)
    if (aiResult?.reasoning) {
      await log(supabase, 'info', `Smart mapping reasoning: ${aiResult.reasoning}`, { user_id: userId, product: sourceProd.name })
    }
  } catch (aiErr) {
    await log(supabase, 'warn', `Smart mapping AI failed for ${sourceProd.name}: ${aiErr.message}`, { user_id: userId })
  }

  // ── 6. Execute the mapping ──────────────────────────────────────────────────
  // Build lookup maps
  const attrById = {}
  for (const a of targetAttrsWithTerms) attrById[a.id] = a

  const attrResults = []
  const cacheInserts = []
  const categoryIds = Array.isArray(aiResult?.category_ids) ? aiResult.category_ids.filter(id => targetCats.some(c => c.id === id)) : []

  for (const mapping of (aiResult?.attributes || [])) {
    let targetAttrId = mapping.is_new_attribute ? null : (mapping.target_id || null)
    const targetAttrName = mapping.target_name || mapping.source_name

    // Create attribute if new
    if (!targetAttrId) {
      try {
        const slug = (mapping.target_slug || targetAttrName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const created = await wooFetch(targetShop, 'products/attributes', 'POST', {
          name: targetAttrName, slug, type: 'select', order_by: 'menu_order', has_archives: false,
        })
        if (created?.id) {
          targetAttrId = created.id
          // Add to our local index so term creation works
          attrById[created.id] = { id: created.id, name: targetAttrName, slug, terms: [] }
        }
      } catch {}
    }

    if (!targetAttrId) continue

    // Process values: create missing terms, collect all term IDs
    const finalOptions = []
    for (const v of (mapping.values || [])) {
      if (!v.name) continue
      if (!v.is_new && v.term_id) {
        // Existing term — just use the name we already know
        finalOptions.push(v.name)
      } else {
        // New term — create it
        try {
          const created = await wooFetch(targetShop, `products/attributes/${targetAttrId}/terms`, 'POST', { name: v.name })
          if (created?.id) finalOptions.push(v.name)
        } catch {
          finalOptions.push(v.name) // Push anyway, WC may accept it
        }
        // Cache the translation
        const srcAttr = (sourceProd.attributes || []).find(a => a.name === mapping.source_name)
        if (srcAttr && mapping.source_name !== v.name) {
          cacheInserts.push({ user_id: userId, source_locale: sourceLocale || 'nl_NL', target_locale: targetLocale || 'de_DE', field_type: 'attribute_term', source_term: mapping.source_name, target_term: v.name, confidence: 0.85, model: 'smart_mapping', use_count: 1 })
        }
      }
    }

    // Cache attribute name mapping
    if (mapping.source_name && targetAttrName && mapping.source_name !== targetAttrName) {
      cacheInserts.push({ user_id: userId, source_locale: sourceLocale || 'nl_NL', target_locale: targetLocale || 'de_DE', field_type: 'attribute', source_term: mapping.source_name, target_term: targetAttrName, confidence: 0.9, model: 'smart_mapping', use_count: 1 })
    }

    attrResults.push({
      source_name: mapping.source_name,
      target_id: targetAttrId,
      target_name: targetAttrName,
      options: finalOptions,
    })
  }

  // Fallback: any source attributes not covered by AI mapping
  // Translate names+values not in cache via a single batch AI call
  const mappedSourceNames = new Set(attrResults.map(r => r.source_name))
  const uncoveredAttrs = (sourceProd.attributes || []).filter(a => !mappedSourceNames.has(a.name))

  if (uncoveredAttrs.length > 0) {
    // Collect what still needs translating (not in cache)
    const needsTranslation = uncoveredAttrs
      .filter(a => !cacheMap[a.name] || (a.options || []).some(v => !cacheMap[v]))
      .map(a => ({ attribute: a.name, terms: (a.options || []).filter(v => !cacheMap[v]) }))

    if (needsTranslation.length > 0) {
      try {
        const raw = await callAI(settings,
          `Translate WooCommerce attribute names and values to ${targetLanguage}. Return ONLY valid JSON.`,
          `Input: ${JSON.stringify(needsTranslation)}
Return: {"translations":[{"attribute":"translated name","terms":["translated value"]}]}`,
          12000
        )
        const parsed = safeJSON(raw)
        const newCacheInserts = []
        for (let i = 0; i < needsTranslation.length; i++) {
          const src = needsTranslation[i]
          const trl = (parsed?.translations || [])[i] || {}
          if (trl.attribute && trl.attribute !== src.attribute) {
            cacheMap[src.attribute] = trl.attribute
            newCacheInserts.push({ user_id: userId, source_locale: sourceLocale || 'nl_NL', target_locale: targetLocale || 'de_DE', field_type: 'attribute', source_term: src.attribute, target_term: trl.attribute, confidence: 0.85, model: 'fallback_translate', use_count: 1 })
          }
          for (let j = 0; j < src.terms.length; j++) {
            const t = (trl.terms || [])[j]
            if (t) {
              cacheMap[src.terms[j]] = t
              newCacheInserts.push({ user_id: userId, source_locale: sourceLocale || 'nl_NL', target_locale: targetLocale || 'de_DE', field_type: 'attribute_term', source_term: src.terms[j], target_term: t, confidence: 0.85, model: 'fallback_translate', use_count: 1 })
            }
          }
        }
        if (supabase && newCacheInserts.length) {
          supabase.from('ai_taxonomy_cache').upsert(newCacheInserts, { onConflict: 'user_id,source_locale,target_locale,field_type,source_term' }).catch(() => {})
        }
      } catch {} // If this fails, we still use source names as last resort
    }

    for (const attr of uncoveredAttrs) {
      const translatedAttrName = cacheMap[attr.name] || attr.name
      const slug = translatedAttrName.toLowerCase()
        .replace(/[äàáâã]/g, 'a').replace(/[ëèéê]/g, 'e').replace(/[ïìíî]/g, 'i')
        .replace(/[öòóô]/g, 'o').replace(/[üùúû]/g, 'u').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

      // Try slug match first, then normalized name match (catches cross-language near-matches)
      let existingAttr = targetAttrsWithTerms.find(a => a.slug === slug)
      if (!existingAttr) {
        const norm = translatedAttrName.toLowerCase().trim()
        existingAttr = targetAttrsWithTerms.find(a => a.name.toLowerCase().trim() === norm)
      }

      let targetAttrId = existingAttr?.id || null

      // If still no match: create a new global attribute in the target shop
      // Never silently drop an attribute — always try to create it
      if (!targetAttrId) {
        try {
          const created = await wooFetch(targetShop, 'products/attributes', 'POST', {
            name: translatedAttrName, slug, type: 'select', order_by: 'menu_order', has_archives: false,
          })
          if (created?.id) {
            targetAttrId = created.id
            targetAttrsWithTerms.push({ id: created.id, name: translatedAttrName, slug, terms: [] })
          }
        } catch (createErr) {
          if (supabase && userId) await log(supabase, 'warn', `Fallback attr create failed "${translatedAttrName}": ${createErr.message}`, { user_id: userId })
        }
      }

      attrResults.push({
        source_name: attr.name,
        target_id: targetAttrId,
        target_name: translatedAttrName,
        options: (attr.options || []).map(v => cacheMap[v] || v),
      })
    }
  }

  // Write cache in background
  if (supabase && cacheInserts.length) {
    supabase.from('ai_taxonomy_cache').upsert(cacheInserts, { onConflict: 'user_id,source_locale,target_locale,field_type,source_term' }).catch(() => {})
  }

  return { attrResults, categoryIds }
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
// ── Detect target shop featured image dimensions ──────────────────────────────
async function detectTargetImageSize(targetShop) {
  try {
    const products = await wooFetch(targetShop, 'products?per_page=3&status=publish&_fields=id,images')
    if (!Array.isArray(products)) return null
    for (const p of products) {
      const img = p.images?.[0]
      if (!img?.src) continue
      // WC returns width/height in the image object if media details are attached
      if (img.width && img.height) return { width: img.width, height: img.height }
      // Fallback: fetch the media item via WP API
      try {
        const base = targetShop.site_url.replace(/\/$/, '')
        const wpAuth = `Basic ${Buffer.from(`${targetShop.consumer_key}:${targetShop.consumer_secret}`).toString('base64')}`
        // Try to get image dimensions from a HEAD request + content-length, or fetch small portion
        // Actually fetch the image and check natural dimensions via response headers
        const res = await fetch(img.src, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
        // Can't get dimensions from headers alone without image parsing
        // Fall back to fetching the media endpoint if we have a media ID
        if (img.id) {
          const mediaRes = await fetch(`${base}/wp-json/wp/v2/media/${img.id}`, {
            headers: { 'Authorization': wpAuth }, signal: AbortSignal.timeout(5000)
          })
          if (mediaRes.ok) {
            const media = await mediaRes.json()
            const w = media.media_details?.width
            const h = media.media_details?.height
            if (w && h) return { width: w, height: h }
          }
        }
      } catch {}
    }
  } catch {}
  return null // Will fall back to WooSyncShop default
}

// ── Generate/crop image to target dimensions using Gemini ─────────────────────
async function generateCroppedImage(imageBuffer, contentType, targetWidth, targetHeight, productName, geminiKey, geminiModel) {
  const b64 = Buffer.from(imageBuffer).toString('base64')
  const aspectRatio = `${targetWidth}:${targetHeight}`
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel || 'gemini-2.5-flash'}:generateContent?key=${geminiKey}`,
    {
      method: 'POST', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: `You are an e-commerce product image editor. Reframe and crop this product image to exactly ${targetWidth}×${targetHeight} pixels (${aspectRatio} aspect ratio).
Keep the main subject (plant/product) centered and well-composed. Fill empty space with a clean neutral background matching the existing background.
Output a high-quality JPEG suitable for an e-commerce product listing.
Product: "${productName}"` },
          { inline_data: { mime_type: contentType, data: b64 } }
        ]}],
        generationConfig: { response_mime_type: 'image/jpeg' }
      })
    }
  )
  if (!res.ok) throw new Error(`Gemini generate: ${res.status}`)
  const data = await res.json()
  const imgPart = data.candidates?.[0]?.content?.parts?.find(p => p.inline_data?.data)
  if (!imgPart?.inline_data?.data) throw new Error('Gemini returned no image')
  return { buffer: Buffer.from(imgPart.inline_data.data, 'base64'), contentType: 'image/jpeg' }
}

// mode: 'ai_vision' — Gemini scans image → SEO filename + alt + title in target language
// mode: 'translate' — uses translated product name, no vision call needed
// mode: 'generate'  — Gemini generates/crops image to target shop dimensions
async function processImages(sourceImages, targetShop, productName, language, imageMode, geminiKey, geminiModel, targetDimensions = null) {
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

      // 2b. Generate mode: Gemini crops/generates image to target dimensions
      let finalBuffer = imageBuffer
      let finalContentType = contentType
      let finalExt = ext
      if (imageMode === 'generate' && geminiKey && targetDimensions?.width && targetDimensions?.height) {
        try {
          const generated = await generateCroppedImage(imageBuffer, contentType, targetDimensions.width, targetDimensions.height, productName, geminiKey, geminiModel)
          finalBuffer   = generated.buffer
          finalContentType = generated.contentType
          finalExt      = 'jpg'
        } catch {} // Fall through with original image if generation fails
      }

      // 2c. Translate mode (or fallback for filename/alt)
      if (!seoFilename) {
        seoFilename = i === 0 ? nameSlug : `${nameSlug}-${i + 1}`
        altText     = altText || (i === 0 ? productName : `${productName} ${i + 1}`)
        titleText   = titleText || productName
      }

      const uid = Math.random().toString(36).slice(2, 6)
      const filename = `${seoFilename}-${uid}.${finalExt}`

      // 3. Upload to WordPress media library
      const uploadRes = await fetch(`${base}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: {
          'Authorization': wpAuth,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': finalContentType,
        },
        body: finalBuffer,
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
    image_mode = 'translate', // 'translate' | 'ai_vision' | 'generate'
    image_generate_size = 'woosyncshop', // 'woosyncshop' | 'target_shop'
    text_mode = 'translate_rewrite', // 'literal' | 'translate_rewrite' | 'seo_write'
    price_markup_pct = 0, // percentage markup on all prices
    seo_use_headers = true,
    seo_word_count = 600,
    seo_add_lists = true,
    seo_custom_params = [],
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
    const srcTierPlugin = detectTierPlugin(sourceShop.active_plugins)
    const tgtTierPlugin = detectTierPlugin(targetShop.active_plugins)
    const geminiKey   = platformSettings?.gemini_api_key || null
    const geminiModel = platformSettings?.ai_model_image || 'gemini-2.5-flash'

    // Detect target shop image dimensions once for all products (if generate mode)
    let targetDimensions = null
    if (image_mode === 'generate') {
      if (image_generate_size === 'target_shop') {
        targetDimensions = await detectTargetImageSize(targetShop)
        await log(supabase, 'info', `Target image dimensions: ${targetDimensions ? `${targetDimensions.width}×${targetDimensions.height}` : 'not detected, using 800×800'}`, { user_id: user.id })
      }
      // WooSyncShop default or fallback when target detection fails
      if (!targetDimensions) targetDimensions = { width: 800, height: 800 }
    }

    await log(supabase, 'info', `Sync create started: ${sourceProducts.length} products → ${targetShop.name} (${language})`, { user_id: user.id, source_shop_id, target_shop_id })

    const results = { created: [], failed: [], skipped: [] }

    // Smart mapping runs per-product (needs product context for category + similar product matching)
    // Cached translations prevent redundant AI calls for repeated attribute names

    // ── Process each product ─────────────────────────────────────────────────
    // Frontend sends one product at a time to avoid 26s timeout.
    // Function handles 1-N but is optimised for 1.
    async function processOne(sourceProd) {
      try {
        // ── 0. Smart attribute + category mapping (per-product AI reasoning) ───────
        const { attrResults, categoryIds } = await smartMapping(
          sourceProd, targetShop, platformSettings, language, tone,
          supabase, user.id, sourceShop.locale, targetShop.locale
        )

        // ── 1. Generate content based on text_mode ────────────────────────────────
        // Build attribute context for SEO write (needed even for literal translate)
        const attrContext = (sourceProd.attributes || [])
          .map(a => `${a.name}: ${(a.options || []).join(', ')}`)
          .join(' | ')

        // Source texts (strip HTML, keep reasonable length)
        const srcDesc      = (sourceProd.description || '').replace(/<[^>]+>/g, '').trim()
        const srcShortDesc = (sourceProd.short_description || '').replace(/<[^>]+>/g, '').trim()

        let systemPrompt, userPrompt, aiTimeout = 20000
        // Token budget: seo_write needs headroom for ~1 token per word of HTML + JSON wrapper
        // translate/literal modes are much smaller — 800 tokens is fine
        let maxTokens = 800

        if (text_mode === 'literal') {
          systemPrompt = `You are a product content translator. Translate EXACTLY to ${language} without any rewrites or additions. Return ONLY valid JSON, no markdown.`
          userPrompt = `Translate these product fields to ${language}:\n${translate_fields.includes('name') ? `name: "${sourceProd.name}"` : ''}\n${translate_fields.includes('description') && srcDesc ? `description: "${srcDesc.slice(0, 800)}"` : ''}\n${translate_fields.includes('short_description') && srcShortDesc ? `short_description: "${srcShortDesc.slice(0, 400)}"` : ''}\nReturn JSON: {"name":"...","description":"...","short_description":"..."}`

        } else if (text_mode === 'seo_write') {
          aiTimeout = 45000
          // seo_word_count words of HTML needs ~1.5 tokens/word + JSON overhead + headers/lists markup
          maxTokens = Math.min(Math.max(seo_word_count * 2 + 800, 2500), 8000)
          const headerInstruction = seo_use_headers ? 'Use H2, H3 and H4 headers to structure the text.' : 'Do not use headers.'
          const listInstruction   = seo_add_lists   ? 'Use bullet point lists (<ul><li>) for features and benefits.' : 'Do not use lists.'
          const customInstructions = (seo_custom_params || []).filter(Boolean).map((p, i) => `${i + 1}. ${p}`).join('\n')
          systemPrompt = `You are an expert SEO copywriter specializing in plant and garden products. Write in ${language} with a ${tone} tone. Return ONLY valid JSON, no markdown, no code fences.`
          userPrompt = `Write an SEO-optimized WooCommerce product listing in ${language} for:\n\nProduct name: "${sourceProd.name}"\nAttributes: ${attrContext || 'none'}\nSource description (for reference only, do NOT copy): "${srcDesc.slice(0, 500)}"\n\nREQUIREMENTS:\n- description: approximately ${seo_word_count} words, HTML formatted, rich and informative\n- ${headerInstruction}\n- ${listInstruction}\n- short_description: 2-3 sentences, compelling summary, max 60 words, plain text (no HTML)\n- name: translated product name in ${language}\n${customInstructions ? `\nCUSTOM INSTRUCTIONS:\n${customInstructions}` : ''}\n\nReturn this exact JSON structure:\n{"name":"...","description":"<p>...</p>","short_description":"..."}`

        } else {
          // translate_rewrite (default)
          maxTokens = 1200
          systemPrompt = `You are a product content writer. Translate to ${language} and adapt naturally for the ${language}-speaking market. Tone: ${tone}. Return ONLY valid JSON, no markdown.`
          userPrompt = `Translate and rewrite for ${language} market:\nname: "${sourceProd.name}"\n${srcDesc ? `description: "${srcDesc.slice(0, 600)}"` : ''}\n${srcShortDesc ? `short_description: "${srcShortDesc.slice(0, 300)}"` : ''}\n\nRules:\n- Expand description to at least 100 words if possible\n- short_description: 1-2 compelling sentences, plain text (no HTML)\n- Adapt naturally, not word-for-word\nReturn JSON: {"name":"...","description":"<p>...</p>","short_description":"..."}`
        }

        let translated = {}
        try {
          const raw = await callAI(platformSettings, systemPrompt, userPrompt, aiTimeout, maxTokens)
          translated = safeJSON(raw) || {}
          if (!translated.name && !translated.description) {
            // safeJSON succeeded but returned empty object — log the raw AI output for debugging
            await log(supabase, 'warn', `AI returned unparseable content for ${sourceProd.name}. Raw (first 300 chars): ${(raw || '').slice(0, 300)}`, { user_id: user.id })
          } else {
            await log(supabase, 'info', `Text generated (${text_mode}) for ${sourceProd.name}: name=${!!translated.name}, desc=${!!translated.description}, short=${!!translated.short_description}`, { user_id: user.id })
          }
        } catch (aiErr) {
          await log(supabase, 'warn', `AI text generation failed for ${sourceProd.name}: ${aiErr.message}`, { user_id: user.id })
          translated = { name: sourceProd.name, description: srcDesc, short_description: srcShortDesc }
        }

        // ── 2. Image handling ─────────────────────────────────────────────────────
        const translatedProductName = translated.name || sourceProd.name
        let processedImages
        if (image_mode === 'generate' && geminiKey && (sourceProd.images || []).length > 0) {
          // Generate mode: download + Gemini crop to target dimensions + upload
          processedImages = await processImages(
            sourceProd.images || [], targetShop, translatedProductName,
            language, image_mode, geminiKey, geminiModel, targetDimensions
          )
        } else {
          // Translate / ai_vision: WC sideloads from source URL (no blocking upload)
          processedImages = buildImagePayload(sourceProd.images || [], translatedProductName)
        }

        // ── 3. SKU generation ───────────────────────────────────────────────
        const newSku = await generateSku(sku_mode, sourceProd, lang_code, supabase, target_shop_id)

        // ── 4. Build attributes for target (from smartMapping results) ─────────
        // IMPORTANT: WooCommerce creates a "local" (non-global) attribute when you send
        // name without id. Always send id for global attributes. If we have no id,
        // skip the attribute — it means smartMapping failed to create/find it.
        const targetAttributes = []
        for (const result of attrResults) {
          if (!result.options.length) continue
          const srcAttr = (sourceProd.attributes || []).find(a => a.name === result.source_name) || {}
          if (!result.target_id) {
            // No global attribute ID — skip to avoid creating local custom attributes
            await log(supabase, 'warn', `Skipping attr "${result.source_name}" — no target_id (smartMapping did not resolve)`, { user_id: user.id })
            continue
          }
          targetAttributes.push({
            id: result.target_id,        // REQUIRED: links to global attribute in Products > Attributen
            name: result.target_name,    // Display name (WC may ignore if id is set, but good to include)
            visible: srcAttr.visible !== false,
            variation: srcAttr.variation || false,
            options: result.options,
          })
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

        // ── Tier pricing: convert between WQM and WPC PBQ if needed ────────────
        // Detect source plugin from meta if active_plugins isn't populated yet
        const resolvedSrcPlugin = srcTierPlugin || detectTierPluginFromMeta(sourceProd.meta_data || [])
        const resolvedTgtPlugin = tgtTierPlugin

        const wqmRaw    = parseMeta((sourceProd.meta_data || []).find(m => m.key === '_wqm_tiers')?.value)
        const wpcpqRaw  = parseMeta((sourceProd.meta_data || []).find(m => m.key === 'wpcpq_prices')?.value)
        const wqmSettings = parseMeta((sourceProd.meta_data || []).find(m => m.key === '_wqm_settings')?.value)

        if (resolvedSrcPlugin === 'wqm' && resolvedTgtPlugin === 'wpcpq' && wqmRaw) {
          // WQM → WPC PBQ
          const converted = wqmToWpcpq(wqmRaw, price_markup_pct)
          if (converted) {
            meta_data.push({ key: 'wpcpq_prices', value: converted })
            meta_data.push({ key: 'wpcpq_enable', value: 'yes' })  // ensure plugin activates for this product
            await log(supabase, 'info', `Tier conversion: WQM→WPC PBQ for ${sourceProd.name} (${converted.length} tiers)`, { user_id: user.id })
          }
        } else if (resolvedSrcPlugin === 'wpcpq' && resolvedTgtPlugin === 'wqm' && wpcpqRaw) {
          // WPC PBQ → WQM
          const converted = wpcpqToWqm(wpcpqRaw, price_markup_pct)
          if (converted) {
            meta_data.push({ key: '_wqm_tiers', value: converted })
            if (wqmSettings) meta_data.push({ key: '_wqm_settings', value: wqmSettings })
            await log(supabase, 'info', `Tier conversion: WPC PBQ→WQM for ${sourceProd.name} (${Object.keys(converted.tiers || {}).length} tiers)`, { user_id: user.id })
          }
        } else if ((resolvedSrcPlugin === 'wqm' || resolvedTgtPlugin === 'wqm' || !resolvedTgtPlugin) && wqmRaw) {
          // WQM → WQM (same plugin or unknown target — copy with markup)
          const tiersData = JSON.parse(JSON.stringify(wqmRaw))
          if (price_markup_pct !== 0 && (tiersData.type || 'fixed') === 'fixed') {
            const tierList = tiersData.tiers
            if (tierList && typeof tierList === 'object') {
              for (const key of Object.keys(tierList)) {
                const n = parseFloat(String(tierList[key].amt ?? '0').replace(',', '.'))
                if (!isNaN(n)) tierList[key].amt = String(Math.round(n * (1 + price_markup_pct / 100) * 100) / 100)
              }
            }
          }
          meta_data.push({ key: '_wqm_tiers', value: tiersData })
          if (wqmSettings) meta_data.push({ key: '_wqm_settings', value: wqmSettings })
        } else if ((resolvedSrcPlugin === 'wpcpq' || resolvedTgtPlugin === 'wpcpq' || !resolvedTgtPlugin) && wpcpqRaw) {
          // WPC PBQ → WPC PBQ (apply markup)
          const factor = 1 + price_markup_pct / 100
          const marked = wpcpqRaw.map(t => {
            if (price_markup_pct !== 0 && t.price && String(t.price).trim() !== '') {
              const n = parseFloat(String(t.price).replace(',', '.')) || 0
              return { ...t, price: String(Math.round(n * factor * 100) / 100) }
            }
            return { ...t }
          })
          meta_data.push({ key: 'wpcpq_prices', value: marked })
          meta_data.push({ key: 'wpcpq_enable', value: 'yes' })
        }

        // Copy remaining non-tier WQM meta (min/max qty, step, group_of)
        const nonTierWqmKeys = ['_wqm_min_quantity', '_wqm_max_quantity', '_wqm_step', '_wqm_group_of']
        for (const k of nonTierWqmKeys) {
          const entry = (sourceProd.meta_data || []).find(m => m.key === k)
          if (entry) meta_data.push({ key: k, value: entry.value })
        }

        // Categories: use AI-determined target category IDs.
        // Fallback when AI fails: don't use source slugs (they're in source language and won't
        // match target shop slugs). Leave categories empty — better than assigning wrong ones.
        const categories = categoryIds.length > 0
          ? categoryIds.map(id => ({ id }))
          : []

        const productPayload = {
          name: translate_fields.includes('name') ? (translated.name || sourceProd.name) : sourceProd.name,
          status: 'draft', // created as draft — user can publish from dashboard
          type: sourceProd.type || 'simple',
          sku: newSku,
          regular_price: (() => {
            const p = parseFloat(sourceProd.regular_price || sourceProd.price || 0)
            return price_markup_pct !== 0 && p > 0 ? String(Math.round(p * (1 + price_markup_pct / 100) * 100) / 100) : String(sourceProd.regular_price || sourceProd.price || '')
          })(),
          description: translate_fields.includes('description')
            ? (translated.description || srcDesc || '')
            : (sourceProd.description || ''),
          short_description: translate_fields.includes('short_description')
            ? (translated.short_description || srcShortDesc || '')
            : (sourceProd.short_description || ''),
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

        // ── 7. SEO meta (awaited inline — background fn has 15min, no race condition) ─
        if (translate_meta) {
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
            } catch (seoErr) {
              await log(supabase, 'warn', `SEO meta failed for ${sourceProd.name}: ${seoErr.message}`, { user_id: user.id })
            }
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
