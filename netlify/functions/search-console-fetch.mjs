// netlify/functions/search-console-fetch.mjs
// GET /api/search-console-fetch?shop_id=&range=7d|30d|90d|year
// Fetches Search Console performance data for a shop domain using
// stored SC OAuth tokens. Returns top queries, top landing pages,
// trend data, and keyword opportunity signals.

import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS })

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'search-console-fetch', message, metadata: meta }) } catch {}
}

// Refresh a Google OAuth token using the stored refresh_token
async function refreshAccessToken(supabase, shop, clientId, clientSecret) {
  if (!shop.sc_refresh_token) return shop.sc_access_token

  // Check if token is still valid (with 2-min buffer)
  const expiry = shop.sc_token_expiry ? new Date(shop.sc_token_expiry) : null
  if (expiry && expiry.getTime() - Date.now() > 120_000) return shop.sc_access_token

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: shop.sc_refresh_token,
        grant_type:    'refresh_token',
      }),
    })
    const data = await res.json()
    if (!data.access_token) throw new Error(data.error || 'token_refresh_failed')

    const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
    await supabase.from('shops').update({
      sc_access_token: data.access_token,
      sc_token_expiry: newExpiry,
    }).eq('id', shop.id)

    return data.access_token
  } catch {
    return shop.sc_access_token // fall back to possibly-stale token
  }
}

// Build SC API date range strings
function getDateRange(range) {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  let start
  switch (range) {
    case '7d':   start = new Date(now - 7   * 86400000).toISOString().slice(0, 10); break
    case '90d':  start = new Date(now - 90  * 86400000).toISOString().slice(0, 10); break
    case 'year': start = new Date(now - 365 * 86400000).toISOString().slice(0, 10); break
    default:     start = new Date(now - 30  * 86400000).toISOString().slice(0, 10); break // 30d
  }
  return { start, end }
}

// Call the Search Console API
async function scQuery(accessToken, siteUrl, payload) {
  const encodedSite = encodeURIComponent(siteUrl)
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization:  'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )
  if (res.status === 403) throw new Error('SC_PERMISSION_DENIED')
  if (res.status === 404) throw new Error('SC_SITE_NOT_FOUND')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `SC API HTTP ${res.status}`)
  }
  return res.json()
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const url    = new URL(req.url)
  const shopId = url.searchParams.get('shop_id')
  const range  = url.searchParams.get('range') || '30d'

  if (!shopId) return json({ error: 'shop_id vereist' }, 400)

  try {
    const { data: shop, error: shopErr } = await supabase
      .from('shops')
      .select('id, name, sc_connected, sc_access_token, sc_refresh_token, sc_token_expiry, sc_site')
      .eq('id', shopId)
      .eq('user_id', user.id)
      .single()

    if (shopErr || !shop) return json({ error: 'Shop niet gevonden' }, 404)
    if (!shop.sc_connected || !shop.sc_access_token) {
      return json({ error: 'Search Console niet gekoppeld voor deze shop' }, 400)
    }
    if (!shop.sc_site) {
      return json({ error: 'Geen Search Console domein geselecteerd voor deze shop' }, 400)
    }

    const clientId     = Netlify.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Netlify.env.get('GOOGLE_CLIENT_SECRET')

    const accessToken = await refreshAccessToken(supabase, shop, clientId, clientSecret)
    const { start, end } = getDateRange(range)
    const siteUrl = shop.sc_site

    // Run 3 SC API queries in parallel:
    // 1. Top queries  2. Top landing pages  3. Daily click trend
    const [queryData, pageData, trendData] = await Promise.all([

      // 1. Top 25 queries — clicks, impressions, CTR, position
      scQuery(accessToken, siteUrl, {
        startDate:  start,
        endDate:    end,
        dimensions: ['query'],
        rowLimit:   25,
        orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
      }).catch(() => null),

      // 2. Top 15 landing pages
      scQuery(accessToken, siteUrl, {
        startDate:  start,
        endDate:    end,
        dimensions: ['page'],
        rowLimit:   15,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      }).catch(() => null),

      // 3. Daily totals for trend chart
      scQuery(accessToken, siteUrl, {
        startDate:  start,
        endDate:    end,
        dimensions: ['date'],
        rowLimit:   400,
        orderBy: [{ fieldName: 'date', sortOrder: 'ASCENDING' }],
      }).catch(() => null),
    ])

    // ── Process queries ──────────────────────────────────────────────────────
    const queries = (queryData?.rows || []).map(r => ({
      query:       r.keys[0],
      clicks:      Math.round(r.clicks      || 0),
      impressions: Math.round(r.impressions || 0),
      ctr:         parseFloat(((r.ctr || 0) * 100).toFixed(1)),
      position:    parseFloat((r.position || 0).toFixed(1)),
    }))

    // Total SC summary
    const totalClicks      = queries.reduce((s, q) => s + q.clicks, 0)
    const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0)
    const avgCtr           = totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(1)) : 0
    const avgPosition      = queries.length > 0
      ? parseFloat((queries.reduce((s, q) => s + q.position, 0) / queries.length).toFixed(1))
      : 0

    // ── Keyword opportunity signals ──────────────────────────────────────────
    // Opportunities = high impressions, position 4-20, CTR below median
    const medianCtr = queries.length > 0
      ? [...queries].sort((a, b) => a.ctr - b.ctr)[Math.floor(queries.length / 2)]?.ctr || 0
      : 0

    const opportunities = queries
      .filter(q =>
        q.impressions >= 50 &&
        q.position >= 4 &&
        q.position <= 20 &&
        q.ctr < medianCtr
      )
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5)
      .map(q => ({
        ...q,
        // Estimate extra clicks if position improves to top 3 (avg CTR ~15%)
        estimated_extra_clicks: Math.round(q.impressions * 0.15) - q.clicks,
      }))

    // ── Process landing pages ────────────────────────────────────────────────
    const pages = (pageData?.rows || []).map(r => {
      const rawPage = r.keys[0]
      // Strip the domain prefix to show relative path
      let path
      try { path = new URL(rawPage).pathname } catch { path = rawPage }
      return {
        page:        path,
        full_url:    rawPage,
        clicks:      Math.round(r.clicks      || 0),
        impressions: Math.round(r.impressions || 0),
        ctr:         parseFloat(((r.ctr || 0) * 100).toFixed(1)),
        position:    parseFloat((r.position || 0).toFixed(1)),
      }
    })

    // ── Daily trend ──────────────────────────────────────────────────────────
    const trend = (trendData?.rows || []).map(r => ({
      date:        r.keys[0],
      clicks:      Math.round(r.clicks      || 0),
      impressions: Math.round(r.impressions || 0),
    }))

    await log(supabase, 'info',
      `SC fetch: ${shop.name} — ${queries.length} queries, ${totalClicks} clicks, range: ${range}`,
      { user_id: user.id, shop_id: shopId }
    )

    return json({
      shop_id:    shopId,
      shop_name:  shop.name,
      sc_site:    siteUrl,
      range,
      date_range: { start, end },
      summary: {
        total_clicks:      totalClicks,
        total_impressions: totalImpressions,
        avg_ctr:           avgCtr,
        avg_position:      avgPosition,
        queries_count:     queries.length,
      },
      queries,
      pages,
      trend,
      opportunities,
    })

  } catch (err) {
    const isPermission = err.message?.includes('SC_PERMISSION')
    const isNotFound   = err.message?.includes('SC_SITE_NOT_FOUND')

    const userMessage = isPermission
      ? 'Geen toegang tot dit Search Console domein. Controleer of je account gemachtigd is.'
      : isNotFound
      ? 'Search Console domein niet gevonden. Verifieer het domein in Google Search Console.'
      : err.message

    await log(supabase, 'error', `SC fetch error: ${err.message}`, { user_id: user.id, shop_id: shopId })
    return json({ error: userMessage }, isPermission || isNotFound ? 400 : 500)
  }
}

export const config = { path: '/api/search-console-fetch' }
