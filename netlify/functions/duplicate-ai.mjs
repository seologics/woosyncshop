import { createClient } from '@supabase/supabase-js'

export const config = { path: '/api/duplicate-ai', timeout: 26 }

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  try {
    const { prompt } = await req.json()
    if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    const { data: settings } = await supabase.from('platform_settings')
      .select('claude_model_content, content_provider, openai_model_content, openai_api_key')
      .eq('id', 1).single()

    const provider = settings?.content_provider || 'claude'

    // ── OpenAI path ──────────────────────────────────────────────────────────
    if (provider === 'openai') {
      const openaiKey = settings?.openai_api_key || Netlify.env.get('OPENAI_API_KEY')
      if (!openaiKey) return new Response(JSON.stringify({ error: 'Geen OpenAI API key geconfigureerd' }), { status: 503, headers: { 'Content-Type': 'application/json' } })

      const model = settings?.openai_model_content || 'gpt-5.4'
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      })
      const data = await resp.json()
      // Normalise to Anthropic-style response shape so frontend parsing stays the same
      const text = data.choices?.[0]?.message?.content || '{}'
      return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Claude path ──────────────────────────────────────────────────────────
    const anthropicKey = Netlify.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return new Response(JSON.stringify({ error: 'Geen Anthropic API key geconfigureerd' }), { status: 503, headers: { 'Content-Type': 'application/json' } })

    const model = settings?.claude_model_content || 'claude-sonnet-4-6-20260217'

    // First call
    const resp1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    })
    const data1 = await resp1.json()

    // If response was cut off (stop_reason = max_tokens), continue it
    if (data1.stop_reason === 'max_tokens') {
      const partial = data1.content?.[0]?.text || ''
      const resp2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model, max_tokens: 1000,
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: partial },
            { role: 'user', content: 'Continue the JSON exactly from where you left off. Do not repeat any part already written.' },
          ],
        }),
      })
      const data2 = await resp2.json()
      const continued = (data2.content?.[0]?.text || '').trim()
      const merged = partial + continued
      return new Response(JSON.stringify({ content: [{ type: 'text', text: merged }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data1), { status: resp1.status, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
