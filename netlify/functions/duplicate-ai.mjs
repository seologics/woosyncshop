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

    const anthropicKey = Netlify.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return new Response(JSON.stringify({ error: 'Geen Anthropic API key geconfigureerd' }), { status: 503, headers: { 'Content-Type': 'application/json' } })

    // Read model preference from platform_settings
    const { data: settings } = await supabase.from('platform_settings').select('claude_model_content').eq('id', 1).single()
    const model = settings?.claude_model_content || 'claude-haiku-4-5-20251001'

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await resp.json()
    return new Response(JSON.stringify(data), { status: resp.status, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
