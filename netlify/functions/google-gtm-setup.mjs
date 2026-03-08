// Zero-knowledge GTM auto-setup
// Creates GA4 Configuration tag + Google Ads Conversion tags inside a GTM container, then publishes.
// POST /api/google-gtm-setup
// Body: { container_path, ga4_measurement_id, gads_conversion_id, gads_conversion_label }
// Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'
const GTM = 'https://www.googleapis.com/tagmanager/v2'

// ── Token helpers ────────────────────────────────────────────────────────────

async function refreshAccessToken(supabase, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Netlify.env.get('GOOGLE_CLIENT_ID'),
      client_secret: Netlify.env.get('GOOGLE_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Token refresh failed: ' + (data.error || 'unknown'))
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await supabase.from('platform_settings').update({
    google_access_token: data.access_token,
    google_token_expiry: expiresAt,
  }).eq('id', 1)
  return data.access_token
}

async function getValidToken(supabase, ps) {
  const expiry  = ps.google_token_expiry ? new Date(ps.google_token_expiry) : null
  const expired = !expiry || expiry < new Date(Date.now() + 60_000)
  if (expired && ps.google_refresh_token) return refreshAccessToken(supabase, ps.google_refresh_token)
  return ps.google_access_token
}

// ── GTM API helpers ──────────────────────────────────────────────────────────

async function gtmGet(path, token) {
  const res = await fetch(`${GTM}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`GTM GET ${path} failed: ${data.message || JSON.stringify(data)}`)
  return data
}

async function gtmPost(path, body, token) {
  const res = await fetch(`${GTM}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`GTM POST ${path} failed: ${data.message || JSON.stringify(data)}`)
  return data
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const supabase = createClient(
      Netlify.env.get('SUPABASE_URL'),
      Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    )

    // Auth — superadmin only
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer '))
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
    if (authErr || user?.email !== SUPERADMIN_EMAIL)
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

    // Parse body
    const { container_path, ga4_measurement_id, gads_conversion_id, gads_conversion_label } = await req.json()
    if (!container_path)
      return new Response(JSON.stringify({ error: 'container_path is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    if (!ga4_measurement_id && !gads_conversion_id)
      return new Response(JSON.stringify({ error: 'Provide at least ga4_measurement_id or gads_conversion_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // Load + refresh token
    const { data: ps } = await supabase.from('platform_settings')
      .select('google_access_token, google_refresh_token, google_token_expiry')
      .eq('id', 1).single()
    if (!ps?.google_access_token && !ps?.google_refresh_token)
      return new Response(JSON.stringify({ error: 'not_connected' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const token = await getValidToken(supabase, ps)

    const created = []  // summary of what was created
    const warnings = [] // non-fatal issues

    // ── 1. Create workspace ─────────────────────────────────────────────────
    let workspace
    try {
      workspace = await gtmPost(`${container_path}/workspaces`, {
        name: 'WooSyncShop Auto-setup',
        description: `Automatisch aangemaakt door WooSyncShop op ${new Date().toLocaleDateString('nl-NL')}`,
      }, token)
    } catch (e) {
      // If workspace creation fails (e.g. limit reached), try to reuse an existing one
      try {
        const wsData = await gtmGet(`${container_path}/workspaces`, token)
        const existing = (wsData.workspace || []).find(w => w.name === 'WooSyncShop Auto-setup') || wsData.workspace?.[0]
        if (!existing) throw new Error('Geen workspace beschikbaar en aanmaken mislukt: ' + e.message)
        workspace = existing
        warnings.push(`Bestaande workspace gebruikt: "${workspace.name}"`)
      } catch (e2) {
        throw new Error('Workspace aanmaken mislukt: ' + e.message)
      }
    }
    const wp = workspace.path  // accounts/xxx/containers/yyy/workspaces/zzz

    // ── 2. Create "All Pages" pageview trigger ──────────────────────────────
    let allPagesTrigger
    try {
      allPagesTrigger = await gtmPost(`${wp}/triggers`, {
        name: 'WooSyncShop — All Pages',
        type: 'pageview',
      }, token)
      created.push('Trigger: All Pages (pageview)')
    } catch (e) {
      // Check if it already exists
      try {
        const triggers = await gtmGet(`${wp}/triggers`, token)
        allPagesTrigger = (triggers.trigger || []).find(t => t.type === 'pageview')
        if (!allPagesTrigger) throw new Error('Geen pageview trigger gevonden: ' + e.message)
        warnings.push(`Bestaande All Pages trigger gebruikt: "${allPagesTrigger.name}"`)
      } catch {
        throw new Error('All Pages trigger aanmaken mislukt: ' + e.message)
      }
    }
    const allPagesId = allPagesTrigger.triggerId

    // ── 3. Create GA4 Configuration tag ────────────────────────────────────
    if (ga4_measurement_id) {
      try {
        await gtmPost(`${wp}/tags`, {
          name: `GA4 Configuratie — ${ga4_measurement_id}`,
          type: 'gaawc',
          parameter: [
            { type: 'TEMPLATE', key: 'measurementId', value: ga4_measurement_id },
            { type: 'BOOLEAN',  key: 'sendPageView',  value: 'true' },
          ],
          firingTriggerId: [allPagesId],
        }, token)
        created.push(`GA4 Configuration tag (${ga4_measurement_id})`)
      } catch (e) {
        warnings.push(`GA4 tag kon niet aangemaakt worden: ${e.message}`)
      }
    }

    // ── 4. Create Google Ads Conversion Linker (if Ads configured) ──────────
    if (gads_conversion_id) {
      try {
        await gtmPost(`${wp}/tags`, {
          name: 'Google Ads Conversion Linker — WooSyncShop',
          type: 'gclidw',
          parameter: [
            { type: 'BOOLEAN', key: 'enableCrossDomainLinking', value: 'false' },
          ],
          firingTriggerId: [allPagesId],
        }, token)
        created.push('Google Ads Conversion Linker tag')
      } catch (e) {
        warnings.push(`Conversion Linker kon niet aangemaakt worden: ${e.message}`)
      }
    }

    // ── 5. Create "Registration Complete" custom event trigger ──────────────
    let registrationTrigger
    if (gads_conversion_id && gads_conversion_label) {
      try {
        registrationTrigger = await gtmPost(`${wp}/triggers`, {
          name: 'WooSyncShop — Registration Complete',
          type: 'customEvent',
          customEventFilter: [{
            type: 'EQUALS',
            parameter: [
              { type: 'TEMPLATE', key: 'arg0', value: '{{_event}}' },
              { type: 'TEMPLATE', key: 'arg1', value: 'registration_complete' },
            ],
          }],
        }, token)
        created.push('Trigger: registration_complete (custom event)')
      } catch (e) {
        warnings.push(`Registration trigger aanmaken mislukt — conversie tag vuurde op All Pages: ${e.message}`)
        registrationTrigger = allPagesTrigger // fallback
      }
    }

    // ── 6. Create Google Ads Conversion Tracking tag ────────────────────────
    if (gads_conversion_id && gads_conversion_label) {
      const convTriggerId = registrationTrigger?.triggerId || allPagesId
      try {
        // Strip AW- prefix from conversion ID for the tag parameter
        const numericId = gads_conversion_id.replace(/^AW-/, '')
        await gtmPost(`${wp}/tags`, {
          name: `Google Ads Conversie — Registratie (${gads_conversion_id})`,
          type: 'awct',
          parameter: [
            { type: 'TEMPLATE', key: 'conversionId',    value: numericId },
            { type: 'TEMPLATE', key: 'conversionLabel', value: gads_conversion_label },
            { type: 'BOOLEAN',  key: 'enableConversionLinker', value: 'true' },
          ],
          firingTriggerId: [convTriggerId],
        }, token)
        created.push(`Google Ads Conversion tag (${gads_conversion_id}/${gads_conversion_label})`)
      } catch (e) {
        warnings.push(`Google Ads Conversie tag kon niet aangemaakt worden: ${e.message}`)
      }
    }

    // ── 7. Create container version ─────────────────────────────────────────
    let version
    try {
      version = await gtmPost(`${wp}:create_version`, {
        name: `WooSyncShop Setup — ${new Date().toLocaleDateString('nl-NL')}`,
        notes: `Automatisch aangemaakt door WooSyncShop.\nTags: ${created.join(', ')}`,
      }, token)
    } catch (e) {
      throw new Error(`Versie aanmaken mislukt: ${e.message}`)
    }

    // ── 8. Publish container version ────────────────────────────────────────
    let published = false
    let publishError = null
    try {
      await gtmPost(`${version.containerVersion.path}:publish`, {}, token)
      published = true
    } catch (e) {
      // Publish can fail if container needs review (e.g. 2FA/approval workflow)
      publishError = e.message
      warnings.push(`Publiceren mislukt (handmatig publiceren vereist): ${e.message}`)
    }

    return new Response(JSON.stringify({
      ok: true,
      workspace_name: workspace.name,
      workspace_path: wp,
      created,
      warnings,
      published,
      publish_error: publishError || undefined,
      version_name: version?.containerVersion?.name,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const config = { path: '/api/google-gtm-setup' }
