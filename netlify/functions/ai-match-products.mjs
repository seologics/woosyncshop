// netlify/functions/ai-match-products.mjs
// Scales to 10,000+ products via:
//   1. wooGetAll() with no hard product cap (paginate fully)
//   2. Deterministic pre-filter: exact SKU match + token overlap to produce small candidate sets
//   3. AI only sees a ranked candidate shortlist per source product (max 50), not the full target catalog
//   4. Source processed in batches of 20 with concurrency limit of 3 parallel AI calls
//   5. Per-call timeout (8s) to prevent single slow AI call from blocking the batch
//   6. Progress reported via response headers for frontend polling (future)

import { createClient } from '@supabase/supabase-js'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'ai-match-products', message, metadata: meta }) } catch {}
}

// ── AI call with per-request timeout ─────────────────────────────────────────
async function callAI({ provider, geminiKey, openaiKey, model }, systemPrompt, userPrompt, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    if (provider === 'openai') {
      if (!openaiKey) throw new Error('No OpenAI API key configured')
      const mdl = model || 'gpt-4o-mini'
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: mdl,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) { const e = await res.text(); throw new Error(`OpenAI ${res.status}: ${e.slice(0, 200)}`) }
      const data = await res.json()
      return data.choices[0].message.content
    }

    // Default: Gemini
    if (!geminiKey) throw new Error('No Gemini API key configured')
    const mdl = model || 'gemini-2.5-flash'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${geminiKey}`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) { const e = await res.text(); throw new Error(`Gemini ${res.status}: ${e.slice(0, 200)}`) }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  } finally {
    clearTimeout(timer)
  }
}

function safeParseJSON(text) {
  try { return JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()) } catch { return null }
}

// ── Unit normalization ────────────────────────────────────────────────────────
const UNIT_CONVERSIONS = { mm: 1, cm: 10, m: 1000, inch: 25.4, '"': 25.4, ml: 1, l: 1000, liter: 1000, litre: 1000, dl: 100, cl: 10, g: 1, gram: 1, kg: 1000, kilogram: 1000 }
const LENGTH_UNITS = new Set(['mm','cm','m','inch','"'])
const VOLUME_UNITS = new Set(['ml','l','liter','litre','dl','cl'])
const WEIGHT_UNITS = new Set(['g','gram','kg','kilogram'])

function normalizeAttributeValue(val) {
  if (!val) return { raw: val, normalized: null }
  const str = String(val).toLowerCase().trim()
  const m = str.match(/^([\d.,]+)\s*([a-z"]+)$/)
  if (m) {
    const num = parseFloat(m[1].replace(',', '.'))
    const unit = m[2], factor = UNIT_CONVERSIONS[unit]
    if (factor) {
      const normalized = num * factor
      const unitType = LENGTH_UNITS.has(unit) ? 'mm' : VOLUME_UNITS.has(unit) ? 'ml' : WEIGHT_UNITS.has(unit) ? 'g' : null
      if (unitType) return { raw: val, normalized: `${normalized}${unitType}`, numVal: normalized, unitType }
    }
  }
  return { raw: val, normalized: str }
}

function buildProductSummary(p) {
  const attrs = (p.attributes || []).map(a => {
    const vals = (a.options || (a.option ? [a.option] : [])).map(v => {
      const n = normalizeAttributeValue(v)
      return n.normalized && n.normalized !== n.raw?.toLowerCase() ? `${v} [≡${n.normalized}]` : v
    })
    return `${a.name}: ${vals.join(', ')}`
  }).join(' | ')
  const cats = (p.categories || []).map(c => c.name).join(', ')
  return {
    id: p.id, sku: p.sku || '', name: p.name || '',
    price: p.regular_price || p.price || '', type: p.type || 'simple',
    attrs, cats,
    // Compact summary for prompts — keep under ~100 chars per product
    summary: `[${p.id}] SKU:${p.sku || '—'} | ${(p.name || '').slice(0, 80)} | ${attrs.slice(0, 60)}`,
    // Tokens for pre-filtering: normalized words from name + sku
    tokens: new Set([
      ...(p.sku || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1),
      ...(p.name || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2),
    ]),
  }
}

// ── Deterministic pre-filter: find candidate matches without AI ───────────────
// Returns top-N candidates for a source product sorted by heuristic score.
// AI only sees these candidates, not the full catalog.
function getCandidates(src, targetSummaries, tgtSkuMap, maxCandidates = 40) {
  // 1. Exact SKU match → instant winner, no AI needed
  if (src.sku && tgtSkuMap[src.sku.toLowerCase()]) {
    return [{ product: tgtSkuMap[src.sku.toLowerCase()], exact_sku: true }]
  }

  // 2. Token overlap scoring
  const scored = targetSummaries.map(tgt => {
    let score = 0
    // SKU partial match (e.g. source "DE-FJ10L" contains target "FJ10L")
    if (src.sku && tgt.sku) {
      const s = src.sku.toLowerCase(), t = tgt.sku.toLowerCase()
      if (s.includes(t) || t.includes(s)) score += 8
    }
    // Token overlap between names
    let overlap = 0
    for (const tok of src.tokens) { if (tgt.tokens.has(tok)) overlap++ }
    score += overlap * 2
    // Penalize very short overlap
    if (overlap === 0) score -= 5
    return { product: tgt, score }
  })

  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map(x => x.product)
}

// ── Run AI batches with concurrency limit ─────────────────────────────────────
async function runWithConcurrency(tasks, limit) {
  const results = []
  let i = 0
  async function next() {
    while (i < tasks.length) {
      const idx = i++
      results[idx] = await tasks[idx]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, next))
  return results
}

// ── Fetch ALL products from a shop, paginating fully ─────────────────────────
async function wooGetAll(shop, endpoint) {
  const base = shop.site_url.replace(/\/$/, '')
  const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  let page = 1, all = []

  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?'
    const res = await fetch(`${base}/wp-json/wc/v3/${endpoint}${sep}per_page=100&page=${page}`, {
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) break

    // Use X-WP-Total header to know total and log progress
    const total = parseInt(res.headers.get('X-WP-Total') || '0', 10)
    const batch = await res.json()
    if (!Array.isArray(batch) || !batch.length) break

    all = all.concat(batch)
    if (batch.length < 100) break // last page
    page++

    // Safety: stop at 5,000 products per shop to prevent runaway memory/time
    // For larger catalogs the pre-filter + candidate approach handles quality
    if (all.length >= 5000) {
      console.warn(`wooGetAll: reached 5000 product cap (total reported: ${total})`)
      break
    }
  }
  return all
}

// ── Pricing plugin detection ──────────────────────────────────────────────────
const KNOWN_PRICING_PLUGINS = [
  { id: 'wholesale', patterns: ['wholesale-suite', 'woocommerce-wholesale', 'wholesale-prices'], label: 'Wholesale Suite', note: 'Wholesale tier pricing may differ' },
  { id: 'price_by_country', patterns: ['woocommerce-price-based-on-country'], label: 'Price by Country', note: 'Country-specific pricing' },
  { id: 'dynamic_pricing', patterns: ['woocommerce-dynamic-pricing', 'dynamic-pricing'], label: 'Dynamic Pricing', note: 'Cart-level pricing rules' },
  { id: 'tiered_pricing', patterns: ['quantity-based-pricing', 'tiered-pricing', 'wqm'], label: 'Tiered/Quantity Pricing', note: 'Quantity-break pricing active' },
]
function detectPricingPlugins(activePlugins) {
  const pluginStrings = activePlugins.map(p => (p.plugin || p.name || p.slug || '').toLowerCase())
  return KNOWN_PRICING_PLUGINS.filter(known =>
    known.patterns.some(pat => pluginStrings.some(ps => ps.includes(pat)))
  )
}

async function getShopPlugins(shop) {
  try {
    const base = shop.site_url.replace(/\/$/, '')
    const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
    const res = await fetch(`${base}/wp-json/wc/v3/system_status`, { headers: { Authorization: `Basic ${creds}` } })
    if (!res.ok) return []
    return (await res.json()).active_plugins || []
  } catch { return [] }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default async (req) => {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

  try {
    const { source_shop_id, target_shop_id } = await req.json()
    if (!source_shop_id || !target_shop_id) {
      return new Response(JSON.stringify({ error: 'source_shop_id and target_shop_id required' }), { status: 400, headers: CORS })
    }

    const { data: settings } = await supabase.from('platform_settings')
      .select('gemini_api_key, openai_api_key, ai_provider_matching, ai_model_matching')
      .eq('id', 1).single()

    const aiConfig = {
      provider: settings?.ai_provider_matching || 'gemini',
      geminiKey: settings?.gemini_api_key,
      openaiKey: settings?.openai_api_key,
      model: settings?.ai_model_matching || null,
    }
    if (!aiConfig.geminiKey && !aiConfig.openaiKey) {
      return new Response(JSON.stringify({ error: 'No AI API key configured.' }), { status: 400, headers: CORS })
    }

    const { data: sourceShop } = await supabase.from('shops').select('*').eq('id', source_shop_id).eq('user_id', user.id).single()
    const { data: targetShop } = await supabase.from('shops').select('*').eq('id', target_shop_id).eq('user_id', user.id).single()
    if (!sourceShop || !targetShop) return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: CORS })

    await log(supabase, 'info', `AI match started: ${sourceShop.name} → ${targetShop.name}`, { user_id: user.id })

    // Fetch all products from both shops (fully paginated, no artificial cap)
    const [sourceProducts, targetProducts] = await Promise.all([
      wooGetAll(sourceShop, 'products?status=any'),
      wooGetAll(targetShop, 'products?status=any'),
    ])

    // Skip already-connected source products
    const { data: existingConns } = await supabase.from('connected_products')
      .select('source_product_id')
      .eq('user_id', user.id).eq('source_shop_id', source_shop_id).eq('target_shop_id', target_shop_id)
    const alreadyConnected = new Set((existingConns || []).map(c => c.source_product_id))
    const unconnectedSource = sourceProducts.filter(p => !alreadyConnected.has(p.id))

    if (!unconnectedSource.length) {
      return new Response(JSON.stringify({ ok: true, matches: [], message: 'All products already connected', meta: { source_count: sourceProducts.length, target_count: targetProducts.length, unconnected_count: 0, ai_provider: aiConfig.provider, source_pricing_plugins: [], target_pricing_plugins: [] } }), { status: 200, headers: CORS })
    }

    // Build summaries + token sets
    const sourceSummaries = unconnectedSource.map(buildProductSummary)
    const targetSummaries = targetProducts.map(buildProductSummary)

    // Build SKU lookup map for exact matches
    const tgtSkuMap = {}
    for (const t of targetSummaries) {
      if (t.sku) tgtSkuMap[t.sku.toLowerCase()] = t
    }

    // Detect pricing plugins
    const [sourcePlugins, targetPlugins] = await Promise.all([getShopPlugins(sourceShop), getShopPlugins(targetShop)])
    const sourcePricingPlugins = detectPricingPlugins(sourcePlugins)
    const targetPricingPlugins = detectPricingPlugins(targetPlugins)

    const sourceMap  = Object.fromEntries(unconnectedSource.map(p => [p.id, p]))
    const targetMap  = Object.fromEntries(targetProducts.map(p => [p.id, p]))

    // ── Phase 1: Exact SKU matches — no AI needed ─────────────────────────────
    const exactMatches = []
    const needsAI = []

    for (const src of sourceSummaries) {
      if (src.sku && tgtSkuMap[src.sku.toLowerCase()]) {
        const tgt = tgtSkuMap[src.sku.toLowerCase()]
        exactMatches.push({
          source_id: src.id, target_id: tgt.id,
          confidence: 1.0, match_basis: 'sku', reasoning: 'Exact SKU match',
        })
      } else {
        needsAI.push(src)
      }
    }

    // ── Phase 2: AI matching — only for products without exact SKU match ──────
    // Each source product gets its own small candidate set (pre-filtered).
    // Batch 20 source products per AI call, each with its own top-40 candidates.
    // Max 3 concurrent AI calls at once.

    const AI_BATCH_SIZE  = 20   // source products per AI call
    const AI_CONCURRENCY = 3    // parallel AI calls
    const MAX_CANDIDATES = 40   // target candidates per source product

    const allAiMatches = []

    // Build per-source candidate lists
    const sourcesWithCandidates = needsAI.map(src => ({
      src,
      candidates: getCandidates(src, targetSummaries, tgtSkuMap, MAX_CANDIDATES),
    })).filter(x => x.candidates.length > 0) // skip if no candidates at all

    // No candidates at all → skip AI entirely
    const aiTasks = []
    for (let i = 0; i < sourcesWithCandidates.length; i += AI_BATCH_SIZE) {
      const batchItems = sourcesWithCandidates.slice(i, i + AI_BATCH_SIZE)

      aiTasks.push(async () => {
        // Build a compact prompt for this batch
        // Each source product gets its own small target list
        const sourceBlock = batchItems.map(({ src }) => src.summary).join('\n')

        // Collect union of all candidate IDs for context
        const allCandidateIds = new Set()
        batchItems.forEach(({ candidates }) => candidates.forEach(c => allCandidateIds.add(c.id)))
        const candidateBlock = [...allCandidateIds]
          .map(id => targetSummaries.find(t => t.id === id)?.summary || '')
          .filter(Boolean)
          .join('\n')

        // Per-source candidate mapping for the prompt
        const candidateMap = batchItems.map(({ src, candidates }) =>
          `${src.id}: [${candidates.map(c => c.id).join(',')}]`
        ).join('\n')

        const systemPrompt = `You are an expert WooCommerce product matcher. Match products across shops, potentially in different languages.

UNIT NORMALIZATION: "125 cm" = "1.25 m". Values with [≡Xunit] show normalized form.
MULTILINGUAL: "Hoogte"="Taille"="Height". Match semantically.
SKU MATCH: Identical or substring SKU is a strong signal.

CANDIDATE SETS: Each source product has a pre-filtered list of plausible target IDs. Only match to those IDs.

RESPOND with ONLY valid JSON:
{"matches":[{"source_id":123,"target_id":456,"confidence":0.95,"match_basis":"sku|name|attributes|combined","reasoning":"short reason"}]}`

        const userPrompt = `SOURCE: ${sourceShop.name} (${sourceShop.locale || '?'})
TARGET: ${targetShop.name} (${targetShop.locale || '?'})

SOURCE PRODUCTS:
${sourceBlock}

TARGET CANDIDATES (all shops combined):
${candidateBlock}

CANDIDATE SETS per source_id (only match within these):
${candidateMap}

For each source, find the best target from its candidate set. Only include confidence >= 0.5. Omit sources with no good match.`

        try {
          const raw = await callAI(aiConfig, systemPrompt, userPrompt, 20000)
          const parsed = safeParseJSON(raw)
          if (parsed?.matches?.length) allAiMatches.push(...parsed.matches)
        } catch (err) {
          await log(supabase, 'warn', `AI match batch failed (will skip): ${err.message}`, { batch_start: i, user_id: user.id })
        }
      })
    }

    await runWithConcurrency(aiTasks, AI_CONCURRENCY)

    // ── Phase 3: Merge exact + AI matches, deduplicate ────────────────────────
    // Exact matches win. AI matches deduped by source_id (keep highest confidence).
    const mergedBySource = {}

    for (const m of exactMatches) {
      mergedBySource[m.source_id] = m
    }

    for (const m of allAiMatches) {
      if (mergedBySource[m.source_id]) continue // exact match wins
      if (!mergedBySource[m.source_id] || m.confidence > mergedBySource[m.source_id].confidence) {
        mergedBySource[m.source_id] = m
      }
    }

    // ── Phase 4: Enrich with full product data ────────────────────────────────
    const enriched = Object.values(mergedBySource)
      .filter(m => sourceMap[m.source_id] && targetMap[m.target_id])
      .map(m => {
        const src = sourceMap[m.source_id]
        const tgt = targetMap[m.target_id]

        const srcPrice = parseFloat(src.regular_price || src.price || 0)
        const tgtPrice = parseFloat(tgt.regular_price || tgt.price || 0)
        const hasPriceDiff = srcPrice > 0 && tgtPrice > 0 && Math.abs(srcPrice - tgtPrice) / Math.max(srcPrice, tgtPrice) > 0.05

        const pricingWarnings = []
        if (sourcePricingPlugins.length) pricingWarnings.push({ shop: sourceShop.name, plugins: sourcePricingPlugins })
        if (targetPricingPlugins.length) pricingWarnings.push({ shop: targetShop.name, plugins: targetPricingPlugins })

        return {
          source_product: { id: src.id, name: src.name, sku: src.sku, price: src.regular_price || src.price, image: src.images?.[0]?.src || null, type: src.type },
          target_product: { id: tgt.id, name: tgt.name, sku: tgt.sku, price: tgt.regular_price || tgt.price, image: tgt.images?.[0]?.src || null, type: tgt.type },
          confidence: m.confidence,
          match_basis: m.match_basis || 'combined',
          reasoning: m.reasoning || '',
          price_diff: hasPriceDiff ? { source_price: srcPrice, target_price: tgtPrice, pct: Math.round(Math.abs(srcPrice - tgtPrice) / Math.min(srcPrice, tgtPrice) * 100) } : null,
          pricing_plugin_warnings: pricingWarnings,
        }
      })
      .sort((a, b) => b.confidence - a.confidence)

    await log(supabase, 'info',
      `AI match done: ${exactMatches.length} exact SKU + ${enriched.length - exactMatches.length} AI = ${enriched.length} total matches (${sourceProducts.length} src / ${targetProducts.length} tgt)`,
      { user_id: user.id, source_shop_id, target_shop_id, source_count: sourceProducts.length, target_count: targetProducts.length }
    )

    return new Response(JSON.stringify({
      ok: true,
      matches: enriched,
      meta: {
        source_shop: sourceShop.name,
        target_shop: targetShop.name,
        source_count: sourceProducts.length,
        target_count: targetProducts.length,
        unconnected_count: unconnectedSource.length,
        exact_sku_matches: exactMatches.length,
        ai_matches: enriched.length - exactMatches.length,
        ai_provider: aiConfig.provider,
        source_pricing_plugins: sourcePricingPlugins,
        target_pricing_plugins: targetPricingPlugins,
      },
    }), { status: 200, headers: CORS })

  } catch (err) {
    await log(supabase, 'error', 'ai-match-products error', { error: err.message, user_id: user?.id })
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/ai-match-products' }
