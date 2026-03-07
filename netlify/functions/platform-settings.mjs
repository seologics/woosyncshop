import { createClient } from '@supabase/supabase-js'

export default async (req) => {
  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  if (req.method === 'GET') {
    // Public fields (tracking IDs only) — no auth needed
    const authHeader = req.headers.get('Authorization')
    let isAdmin = false

    if (authHeader?.startsWith('Bearer ')) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
      isAdmin = user?.email === 'leadingvation@gmail.com'
    }

    const selectFields = isAdmin
      ? 'gtm_id, ga4_id, gads_conversion_id, gads_conversion_label, gemini_api_key, tinypng_api_key, mollie_api_key'
      : 'gtm_id, ga4_id, gads_conversion_id, gads_conversion_label'

    const { data, error } = await supabase
      .from('platform_settings')
      .select(selectFields)
      .eq('id', 1)
      .single()

    if (error) return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify(data || {}), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
    // Verify superadmin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    const token = authHeader.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user || user.email !== 'leadingvation@gmail.com') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const { gtm_id, ga4_id, gads_conversion_id, gads_conversion_label, gemini_api_key, tinypng_api_key, mollie_api_key } = body

    await supabase.from('platform_settings').upsert({
      id: 1,
      gtm_id: gtm_id || null,
      ga4_id: ga4_id || null,
      gads_conversion_id: gads_conversion_id || null,
      gads_conversion_label: gads_conversion_label || null,
      gemini_api_key: gemini_api_key || null,
      tinypng_api_key: tinypng_api_key || null,
      mollie_api_key: mollie_api_key || null,
      updated_at: new Date().toISOString()
    })

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config = { path: '/api/platform-settings' }
