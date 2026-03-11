import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'platform-settings', message, metadata: meta }) } catch {}
}

export default async (req) => {
  try {
    const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

    if (req.method === 'GET') {
      const authHeader = req.headers.get('Authorization')
      let isAdmin = false
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
          isAdmin = user?.email === SUPERADMIN_EMAIL
        } catch {}
      }
      // Public fields (needed by TrackingInjector on frontend without auth)
      const publicFields = 'gtm_id, ga4_id, gads_conversion_id, gads_conversion_label, fb_pixel_id, tt_pixel_id'
      const adminFields = `${publicFields}, gemini_api_key, tinypng_api_key, mollie_api_key, contact_notification_email, openai_api_key, ai_provider_matching, ai_provider_translation, ai_provider_image, ai_provider_normalization, ai_model_matching, ai_model_translation, ai_model_image, ai_model_normalization`
      const { data, error } = await supabase.from('platform_settings').select(isAdmin ? adminFields : publicFields).eq('id', 1).single()
      if (error) return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify(data || {}), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    if (req.method === 'POST') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
      const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
      if (authErr || !user || user.email !== SUPERADMIN_EMAIL) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

      const body = await req.json()
      const {
        gtm_id, ga4_id, gads_conversion_id, gads_conversion_label,
        fb_pixel_id, tt_pixel_id,
        gemini_api_key, tinypng_api_key, mollie_api_key, contact_notification_email,
        openai_api_key,
        ai_provider_matching, ai_provider_translation, ai_provider_image, ai_provider_normalization,
        ai_model_matching, ai_model_translation, ai_model_image, ai_model_normalization,
      } = body

      const changed = Object.entries({
        gtm_id, ga4_id, gads_conversion_id, gads_conversion_label,
        fb_pixel_id, tt_pixel_id,
        gemini_api_key: gemini_api_key ? '***' : null,
        tinypng_api_key: tinypng_api_key ? '***' : null,
        mollie_api_key: mollie_api_key ? '***' : null,
        openai_api_key: openai_api_key ? '***' : null,
        contact_notification_email,
        ai_provider_matching, ai_provider_translation, ai_provider_image, ai_provider_normalization,
        ai_model_matching, ai_model_translation, ai_model_image, ai_model_normalization,
      }).filter(([, v]) => v !== undefined).map(([k]) => k)

      // Build upsert payload — only include API key fields if explicitly provided
      // (empty/missing = preserve existing value in DB)
      const upsertData = {
        id: 1,
        gtm_id: gtm_id || null, ga4_id: ga4_id || null,
        gads_conversion_id: gads_conversion_id || null, gads_conversion_label: gads_conversion_label || null,
        fb_pixel_id: fb_pixel_id || null, tt_pixel_id: tt_pixel_id || null,
        contact_notification_email: contact_notification_email || null,
        ai_provider_matching: ai_provider_matching || 'gemini',
        ai_provider_translation: ai_provider_translation || 'gemini',
        ai_provider_image: ai_provider_image || 'gemini',
        ai_provider_normalization: ai_provider_normalization || 'gemini',
        ai_model_matching: ai_model_matching || null,
        ai_model_translation: ai_model_translation || null,
        ai_model_image: ai_model_image || null,
        ai_model_normalization: ai_model_normalization || null,
        updated_at: new Date().toISOString()
      };
      // Only overwrite API keys if a real value was provided
      if (gemini_api_key?.trim())  upsertData.gemini_api_key  = gemini_api_key.trim();
      if (openai_api_key?.trim())  upsertData.openai_api_key  = openai_api_key.trim();
      if (tinypng_api_key?.trim()) upsertData.tinypng_api_key = tinypng_api_key.trim();
      if (mollie_api_key?.trim())  upsertData.mollie_api_key  = mollie_api_key.trim();
      const { error: upsertErr } = await supabase.from('platform_settings').upsert(upsertData)

      if (upsertErr) {
        await log(supabase, 'error', 'Platform settings save failed', { error: upsertErr.message })
        return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

      await log(supabase, 'info', 'Platform settings updated', { updated_fields: changed })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Method not allowed', { status: 405 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/platform-settings' }
