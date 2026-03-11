import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'ai-translate', message, metadata: meta }) } catch {}
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  // Check AI is enabled for this user
  const { data: profile } = await supabase.from('user_profiles')
    .select('ai_taxonomy_enabled, ai_taxonomy_model, ai_taxonomy_threshold, plan')
    .eq('id', user.id).single()

  if (!profile?.ai_taxonomy_enabled && user.email !== SUPERADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'AI taxonomie vertaling niet ingeschakeld voor dit account' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  // Get Gemini API key
  const { data: settings } = await supabase.from('platform_settings').select('gemini_api_key, openai_api_key, ai_model_translation, ai_provider_translation').eq('id', 1).single()
  const geminiKey = settings?.gemini_api_key
  if (!geminiKey) return new Response(JSON.stringify({ error: 'Geen Gemini API key geconfigureerd' }), { status: 503, headers: { 'Content-Type': 'application/json' } })

  try {
    const { term, source_locale, target_locale, field = 'category', existing_terms = [] } = await req.json()
    if (!term || !source_locale || !target_locale) {
      return new Response(JSON.stringify({ error: 'term, source_locale, target_locale required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const model = settings?.ai_model_translation || profile?.ai_taxonomy_model || 'gemini-2.5-flash'
    const threshold = profile?.ai_taxonomy_threshold || 0.85
    const cacheKey = `${source_locale}:${target_locale}:${field}:${term}`

    // Check cache first
    const { data: cached } = await supabase.from('ai_translation_cache')
      .select('*').eq('cache_key', cacheKey).maybeSingle()

    if (cached) {
      await log(supabase, 'info', `AI translate cache hit: ${term} → ${cached.target_term}`, { user_id: user.id, source_locale, target_locale, field })
      return new Response(JSON.stringify({
        term: cached.target_term,
        confidence: cached.confidence,
        cached: true,
        model: cached.model,
        cache_key: cacheKey,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Same language locales (e.g. nl_NL → nl_BE) — skip AI, use direct passthrough
    const srcLang = source_locale.split('_')[0]
    const tgtLang = target_locale.split('_')[0]
    if (srcLang === tgtLang) {
      const result = { term, confidence: 1.0, is_existing: existing_terms.includes(term) }
      await supabase.from('ai_translation_cache').upsert({
        cache_key: cacheKey, user_id: user.id,
        source_locale, target_locale, field,
        source_term: term, target_term: term,
        confidence: 1.0, model: 'passthrough',
      })
      return new Response(JSON.stringify({ ...result, cached: false, model: 'passthrough' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Call Gemini
    const prompt = `You are a WooCommerce product taxonomy translator.

Source locale: ${source_locale}
Target locale: ${target_locale}
Field type: ${field}
Term to translate: "${term}"
${existing_terms.length > 0 ? `Existing terms in target shop: ${JSON.stringify(existing_terms)}

Prefer matching an existing term if semantically equivalent.` : ''}

Rules:
- Return the best translation for the target locale
- If an existing term matches well, return that exact term
- For product attributes that are measurements (cm, kg, etc.), keep them as-is
- Keep brand names and proper nouns unchanged
- Return ONLY valid JSON with no markdown: {"term": "translated text", "confidence": 0.0-1.0, "is_existing": true/false}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      await log(supabase, 'error', `Gemini API error for ${term}`, { status: geminiRes.status, error: errText.slice(0, 200) })
      return new Response(JSON.stringify({ error: `Gemini API fout: ${geminiRes.status}` }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }

    const geminiData = await geminiRes.json()
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const cleanText = rawText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleanText)

    if (!parsed.term) throw new Error('Gemini returned invalid response')

    // Only cache if confidence meets threshold
    if (parsed.confidence >= threshold) {
      await supabase.from('ai_translation_cache').upsert({
        cache_key: cacheKey,
        user_id: user.id,
        source_locale, target_locale, field,
        source_term: term,
        target_term: parsed.term,
        confidence: parsed.confidence,
        model,
      })
    }

    await log(supabase, 'info', `AI translate: "${term}" → "${parsed.term}" (${parsed.confidence})`, {
      user_id: user.id, source_locale, target_locale, field, model, confidence: parsed.confidence,
    })

    return new Response(JSON.stringify({
      term: parsed.term,
      confidence: parsed.confidence,
      is_existing: parsed.is_existing || false,
      cached: false,
      model,
      cache_key: cacheKey,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    await log(supabase, 'error', 'ai-translate unhandled error', { error: err.message })
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/ai-translate' }
