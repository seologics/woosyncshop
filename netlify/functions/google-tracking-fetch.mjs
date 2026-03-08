// Fetches GTM containers, GA4 properties, Google Ads accounts using stored OAuth tokens
// Returns data for dropdowns in TrackingSettings UI

import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'

async function refreshAccessToken(supabase, refreshToken) {
  const clientId     = Netlify.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Netlify.env.get('GOOGLE_CLIENT_SECRET')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
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

async function getValidToken(supabase, settings) {
  const expiry = settings.google_token_expiry ? new Date(settings.google_token_expiry) : null
  const expired = !expiry || expiry < new Date(Date.now() + 60_000) // refresh 1 min before expiry
  if (expired && settings.google_refresh_token) {
    return await refreshAccessToken(supabase, settings.google_refresh_token)
  }
  return settings.google_access_token
}

export default async (req) => {
  try {
    const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

    // Auth check — superadmin only
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
    if (authErr || user?.email !== SUPERADMIN_EMAIL) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

    // Load stored tokens
    const { data: ps } = await supabase.from('platform_settings')
      .select('google_access_token, google_refresh_token, google_token_expiry, google_connected_email')
      .eq('id', 1).single()

    if (!ps?.google_access_token && !ps?.google_refresh_token) {
      return new Response(JSON.stringify({ error: 'not_connected' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const token = await getValidToken(supabase, ps)
    const headers = { Authorization: `Bearer ${token}` }
    const result = { connected_email: ps.google_connected_email, gtm: [], ga4: [], gads: [] }

    // ── GTM: fetch all accounts → containers ──
    try {
      const accRes = await fetch('https://www.googleapis.com/tagmanager/v2/accounts', { headers })
      const accData = await accRes.json()
      const accounts = accData.account || []

      for (const acc of accounts) {
        const conRes = await fetch(`https://www.googleapis.com/tagmanager/v2/${acc.path}/containers`, { headers })
        const conData = await conRes.json()
        for (const con of (conData.container || [])) {
          result.gtm.push({
            id: con.publicId,               // GTM-XXXXXX
            label: `${con.name} (${con.publicId})`,
            account: acc.name,
            path: con.path,                 // accounts/xxx/containers/yyy — needed for write API
          })
        }
      }
    } catch (e) { result.gtm_error = e.message }

    // ── GA4: fetch all accounts → properties ──
    try {
      const propRes = await fetch('https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:accounts/-', { headers })
      const propData = await propRes.json()
      for (const prop of (propData.properties || [])) {
        const measurementId = prop.name.replace('properties/', 'G-').toUpperCase()
        // Get actual measurement ID from data streams
        try {
          const streamRes = await fetch(`https://analyticsadmin.googleapis.com/v1beta/${prop.name}/dataStreams`, { headers })
          const streamData = await streamRes.json()
          const webStream = (streamData.dataStreams || []).find(s => s.type === 'WEB_DATA_STREAM')
          if (webStream?.webStreamData?.measurementId) {
            result.ga4.push({
              id: webStream.webStreamData.measurementId,
              label: `${prop.displayName} (${webStream.webStreamData.measurementId})`,
              property: prop.name,
            })
          }
        } catch {
          // fallback: include property without measurement ID
          result.ga4.push({
            id: prop.name.replace('properties/', 'G-'),
            label: prop.displayName,
          })
        }
      }
    } catch (e) { result.ga4_error = e.message }

    // ── Google Ads: fetch accessible customers ──
    try {
      const devToken = Netlify.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
      if (devToken) {
        const adsRes = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
          headers: { ...headers, 'developer-token': devToken }
        })
        const adsData = await adsRes.json()
        for (const resourceName of (adsData.resourceNames || [])) {
          const customerId = resourceName.replace('customers/', '')
          // Fetch conversion actions for this customer
          try {
            const convRes = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
              method: 'POST',
              headers: { ...headers, 'developer-token': devToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: "SELECT customer.id, customer.descriptive_name, conversion_action.id, conversion_action.name, conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.status = 'ENABLED' LIMIT 50" })
            })
            const convData = await convRes.json()
            for (const row of (convData.results || [])) {
              const snippet = row.conversionAction?.tagSnippets?.find(s => s.type === 'WEBPAGE')
              const awId = `AW-${customerId}`
              const label = snippet?.eventSnippet?.match(/send_to.*?'([^']+)'/)?.[1]?.split('/')?.[1] || row.conversionAction?.id
              result.gads.push({
                id: awId,
                label_value: label || '',
                label: `${row.customer?.descriptiveName || customerId} → ${row.conversionAction?.name} (${awId})`,
                conversion_id: awId,
                conversion_label: label || '',
              })
            }
          } catch {}
        }
      } else {
        result.gads_note = 'GOOGLE_ADS_DEVELOPER_TOKEN not set — Google Ads lookup unavailable. Add it in Netlify env vars.'
      }
    } catch (e) { result.gads_error = e.message }

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/google-tracking-fetch' }
