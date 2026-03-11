import { createClient } from '@supabase/supabase-js'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'ai-match-products', message, metadata: meta }) } catch {}
}

// ── Shared AI pipeline: routes to Gemini or OpenAI ──────────────────────────
async function callAI({ provider, geminiKey, openaiKey, model }, systemPrompt, userPrompt) {
  if (provider === 'openai') {
    if (!openaiKey) throw new Error('No OpenAI API key configured')
    const mdl = model || 'gpt-4o-mini'
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: mdl,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.choices[0].message.content
  }

  // Default: Gemini
  if (!geminiKey) throw new Error('No Gemini API key configured')
  const mdl = model || 'gemini-2.0-flash-lite'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.1 },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
}

function safeParseJSON(text) {
  try {
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return null
  }
}

// ── Unit normalization ───────────────────────────────────────────────────────
// Converts attribute values to a canonical numeric+unit form for comparison
const UNIT_CONVERSIONS = {
  // Length → mm
  mm: 1, cm: 10, m: 1000, inch: 25.4, '"': 25.4,
  // Volume → ml
  ml: 1, l: 1000, liter: 1000, litre: 1000, dl: 100, cl: 10,
  // Weight → g
  g: 1, gram: 1, kg: 1000, kilogram: 1000,
}
const LENGTH_UNITS = new Set(['mm','cm','m','inch','"'])
const VOLUME_UNITS = new Set(['ml','l','liter','litre','dl','cl'])
const WEIGHT_UNITS = new Set(['g','gram','kg','kilogram'])

function normalizeAttributeValue(val) {
  if (!val) return { raw: val, normalized: null }
  const str = String(val).toLowerCase().trim()
  // Match patterns like "125 cm", "10L", "2-3 jaar/ans/years", "1.25m"
  const numUnitMatch = str.match(/^([\d.,]+)\s*([a-z"]+)$/)
  if (numUnitMatch) {
    const num = parseFloat(numUnitMatch[1].replace(',', '.'))
    const unit = numUnitMatch[2]
    const factor = UNIT_CONVERSIONS[unit]
    if (factor) {
      const normalized = num * factor
      let unitType = LENGTH_UNITS.has(unit) ? 'mm' : VOLUME_UNITS.has(unit) ? 'ml' : WEIGHT_UNITS.has(unit) ? 'g' : null
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
    id: p.id,
    sku: p.sku || '',
    name: p.name || '',
    short_desc: (p.short_description || '').replace(/<[^>]+>/g, '').slice(0, 200),
    price: p.regular_price || p.price || '',
    type: p.type || 'simple',
    attrs,
    cats,
    summary: `[${p.id}] SKU:${p.sku || '—'} | ${p.name} | ${attrs || 'no attrs'} | cats:${cats || '—'}`,
  }
}

// ── Pricing plugin detection ─────────────────────────────────────────────────
const KNOWN_PRICING_PLUGINS = [
  { id: 'wholesale', patterns: ['wholesale-suite', 'woocommerce-wholesale', 'wholesale-prices'], label: 'Wholesale Suite', note: 'Wholesale tier pricing may differ from standard price' },
  { id: 'price_by_country', patterns: ['woocommerce-price-based-on-country', 'price-based-on-country'], label: 'Price by Country', note: 'Country-specific pricing — currency/price may differ per region' },
  { id: 'dynamic_pricing', patterns: ['woocommerce-dynamic-pricing', 'dynamic-pricing'], label: 'Dynamic Pricing', note: 'Cart-level pricing rules — displayed price may not reflect actual price' },
  { id: 'role_pricing', patterns: ['role-based-pricing', 'woo-role-pricing', 'user-role-pricing'], label: 'Role-Based Pricing', note: 'Prices vary per user role' },
  { id: 'currency_switcher', patterns: ['currency-switcher', 'aelia-currency-switcher', 'woo-multi-currency'], label: 'Multi-Currency', note: 'Multiple currencies active — prices depend on customer locale' },
  { id: 'yith_pricing', patterns: ['yith-woocommerce-dynamic-pricing', 'yith-dynamic-pricing'], label: 'YITH Dynamic Pricing', note: 'Dynamic discount rules active' },
  { id: 'tiered_pricing', patterns: ['quantity-based-pricing', 'tiered-pricing', 'wqm'], label: 'Tiered/Quantity Pricing', note: 'Quantity-break pricing active — effective price depends on order quantity' },
]

function detectPricingPlugins(activePlugins) {
  const detected = []
  const pluginStrings = activePlugins.map(p => (p.plugin || p.name || p.slug || '').toLowerCase())
  for (const known of KNOWN_PRICING_PLUGINS) {
    if (known.patterns.some(pat => pluginStrings.some(ps => ps.includes(pat)))) {
      detected.push(known)
    }
  }
  return detected
}

async function getShopPlugins(shop) {
  try {
    const base = shop.site_url.replace(/\/$/, '')
    const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
    const res = await fetch(`${base}/wp-json/wc/v3/system_status`, {
      headers: { 'Authorization': `Basic ${creds}` }
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.active_plugins || []
  } catch { return [] }
}

async function wooGetAll(shop, endpoint, perPage = 100) {
  const base = shop.site_url.replace(/\/$/, '')
  const creds = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)
  let page = 1, all = []
  while (true) {
    const res = await fetch(`${base}/wp-json/wc/v3/${endpoint}&per_page=${perPage}&page=${page}`, {
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' }
    })
    if (!res.ok) break
    const batch = await res.json()
    if (!Array.isArray(batch) || !batch.length) break
    all = all.concat(batch)
    if (batch.length < perPage) break
    page++
    if (all.length >= 500) break // safety cap
  }
  return all
}

// ── Main match function ──────────────────────────────────────────────────────
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  try {
    const { source_shop_id, target_shop_id } = await req.json()
    if (!source_shop_id || !target_shop_id) {
      return new Response(JSON.stringify({ error: 'source_shop_id and target_shop_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Load platform settings (AI keys + provider prefs)
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
      return new Response(JSON.stringify({ error: 'No AI API key configured. Add a Gemini or OpenAI key in Platform Settings.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Load shops
    const { data: sourceShop } = await supabase.from('shops').select('*').eq('id', source_shop_id).eq('user_id', user.id).single()
    const { data: targetShop } = await supabase.from('shops').select('*').eq('id', target_shop_id).eq('user_id', user.id).single()
    if (!sourceShop || !targetShop) return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    // Fetch products from both shops
    await log(supabase, 'info', `AI match scan started: ${sourceShop.name} → ${targetShop.name}`, { user_id: user.id })
    const [sourceProducts, targetProducts] = await Promise.all([
      wooGetAll(sourceShop, 'products?status=any'),
      wooGetAll(targetShop, 'products?status=any'),
    ])

    // Fetch already-connected product IDs (skip those)
    const { data: existingConns } = await supabase.from('connected_products')
      .select('source_product_id, target_product_id')
      .eq('user_id', user.id).eq('source_shop_id', source_shop_id).eq('target_shop_id', target_shop_id)
    const alreadyConnectedSource = new Set((existingConns || []).map(c => c.source_product_id))

    // Filter out already-connected source products
    const unconnectedSource = sourceProducts.filter(p => !alreadyConnectedSource.has(p.id))

    // Build compact summaries
    const sourceSummaries = unconnectedSource.map(buildProductSummary)
    const targetSummaries = targetProducts.map(buildProductSummary)

    if (!sourceSummaries.length) {
      return new Response(JSON.stringify({ matches: [], message: 'All products already connected', source_count: 0, target_count: targetProducts.length }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Detect pricing plugins on both shops in parallel
    const [sourcePlugins, targetPlugins] = await Promise.all([
      getShopPlugins(sourceShop),
      getShopPlugins(targetShop),
    ])
    const sourcePricingPlugins = detectPricingPlugins(sourcePlugins)
    const targetPricingPlugins = detectPricingPlugins(targetPlugins)

    // Process in batches of 30 source products to avoid token limits
    const BATCH_SIZE = 30
    const allMatches = []

    for (let i = 0; i < sourceSummaries.length; i += BATCH_SIZE) {
      const batch = sourceSummaries.slice(i, i + BATCH_SIZE)

      const systemPrompt = `You are an expert WooCommerce product matcher. You match products across different webshops, potentially in different languages (Dutch, French, German, English, etc.).

UNIT NORMALIZATION: Values like "125 cm" and "1.25 m" are the same. Values with [≡Xunit] suffix show the normalized form — use that for comparison.

MULTILINGUAL: "Hoogte" = "Taille" = "Height". "Gewicht" = "Poids" = "Weight". Match semantically across languages.

SKU MATCH: If SKUs are identical or the target SKU appears as a substring of the source SKU (or vice versa), this is a strong signal.

RESPOND with ONLY valid JSON — no markdown, no explanation. Format:
{
  "matches": [
    {
      "source_id": 123,
      "target_id": 456,
      "confidence": 0.95,
      "match_basis": "sku|name|attributes|combined",
      "reasoning": "Short explanation of why these match",
      "unit_notes": "e.g. 125cm normalized to 1250mm matches target 1250mm",
      "price_diff": { "source": "14.95", "target": "19.95", "pct": 33 }
    }
  ]
}`

      const userPrompt = `SOURCE SHOP: ${sourceShop.name} (${sourceShop.locale || 'unknown locale'})
TARGET SHOP: ${targetShop.name} (${targetShop.locale || 'unknown locale'})

SOURCE PRODUCTS TO MATCH (${batch.length}):
${batch.map(p => p.summary).join('\n')}

TARGET SHOP PRODUCTS (${targetSummaries.length}):
${targetSummaries.map(p => p.summary).join('\n')}

Find the best match in TARGET for each SOURCE product. Only include matches with confidence >= 0.5. If no confident match exists for a source product, omit it. Include price_diff only when prices differ.`

      try {
        const raw = await callAI(aiConfig, systemPrompt, userPrompt)
        const parsed = safeParseJSON(raw)
        if (parsed?.matches?.length) {
          allMatches.push(...parsed.matches)
        }
      } catch (err) {
        await log(supabase, 'error', `AI match batch ${i}-${i+BATCH_SIZE} failed`, { error: err.message })
      }
    }

    // Enrich matches with full product data + pricing warnings
    const sourceMap = Object.fromEntries(unconnectedSource.map(p => [p.id, p]))
    const targetMap = Object.fromEntries(targetProducts.map(p => [p.id, p]))

    const enriched = allMatches
      .filter(m => sourceMap[m.source_id] && targetMap[m.target_id])
      .map(m => {
        const src = sourceMap[m.source_id]
        const tgt = targetMap[m.target_id]

        // Build pricing warning
        const pricingWarnings = []
        if (sourcePricingPlugins.length) {
          pricingWarnings.push({ shop: sourceShop.name, plugins: sourcePricingPlugins })
        }
        if (targetPricingPlugins.length) {
          pricingWarnings.push({ shop: targetShop.name, plugins: targetPricingPlugins })
        }

        // Standard price diff (even without plugins)
        const srcPrice = parseFloat(src.regular_price || src.price || 0)
        const tgtPrice = parseFloat(tgt.regular_price || tgt.price || 0)
        const hasPriceDiff = srcPrice > 0 && tgtPrice > 0 && Math.abs(srcPrice - tgtPrice) / Math.max(srcPrice, tgtPrice) > 0.05

        return {
          source_product: {
            id: src.id, name: src.name, sku: src.sku,
            price: src.regular_price || src.price,
            image: src.images?.[0]?.src || null,
            type: src.type,
          },
          target_product: {
            id: tgt.id, name: tgt.name, sku: tgt.sku,
            price: tgt.regular_price || tgt.price,
            image: tgt.images?.[0]?.src || null,
            type: tgt.type,
          },
          confidence: m.confidence,
          match_basis: m.match_basis || 'combined',
          reasoning: m.reasoning || '',
          unit_notes: m.unit_notes || null,
          price_diff: hasPriceDiff ? {
            source_price: srcPrice,
            target_price: tgtPrice,
            pct: Math.round(Math.abs(srcPrice - tgtPrice) / Math.min(srcPrice, tgtPrice) * 100),
          } : null,
          pricing_plugin_warnings: pricingWarnings,
        }
      })
      .sort((a, b) => b.confidence - a.confidence)

    await log(supabase, 'info', `AI match scan complete: ${enriched.length} suggestions`, {
      user_id: user.id, source_shop_id, target_shop_id,
      source_count: unconnectedSource.length, target_count: targetProducts.length,
      match_count: enriched.length,
    })

    return new Response(JSON.stringify({
      ok: true,
      matches: enriched,
      meta: {
        source_shop: sourceShop.name,
        target_shop: targetShop.name,
        source_count: sourceProducts.length,
        target_count: targetProducts.length,
        unconnected_count: unconnectedSource.length,
        ai_provider: aiConfig.provider,
        source_pricing_plugins: sourcePricingPlugins,
        target_pricing_plugins: targetPricingPlugins,
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    await log(supabase, 'error', 'ai-match-products error', { error: err.message, user_id: user?.id })
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/ai-match-products' }
