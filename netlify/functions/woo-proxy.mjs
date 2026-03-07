import { createClient } from '@supabase/supabase-js'

// Proxy all WooCommerce REST API calls server-side
// so consumer keys never touch the browser
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { shop_id, endpoint, method = 'GET', data } = body

  if (!shop_id || !endpoint) {
    return new Response(JSON.stringify({ error: 'shop_id and endpoint required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Verify auth token from Authorization header
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const token = authHeader.slice(7)

  // Init Supabase with service role to fetch shop credentials
  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  // Verify the JWT and get the user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Fetch shop credentials (only if this shop belongs to this user)
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('site_url, consumer_key, consumer_secret')
    .eq('id', shop_id)
    .eq('user_id', user.id)
    .single()

  if (shopError || !shop) {
    return new Response(JSON.stringify({ error: 'Shop not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Build WooCommerce API URL
  const baseUrl = shop.site_url.replace(/\/$/, '')
  const wooUrl = `${baseUrl}/wp-json/wc/v3/${endpoint.replace(/^\//, '')}`

  // Build Basic Auth from consumer key + secret
  const credentials = btoa(`${shop.consumer_key}:${shop.consumer_secret}`)

  const fetchOptions = {
    method,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    }
  }

  if (data && method !== 'GET') {
    fetchOptions.body = JSON.stringify(data)
  }

  try {
    const wooRes = await fetch(wooUrl, fetchOptions)
    const wooData = await wooRes.json()

    return new Response(JSON.stringify(wooData), {
      status: wooRes.status,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'WooCommerce request failed', detail: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = {
  path: '/api/woo'
}
