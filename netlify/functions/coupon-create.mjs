import { createClient } from '@supabase/supabase-js'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { shopId, code, discount_type, amount, usage_limit, usage_limit_per_user, use_schedule, expiry_hours, has_adv_coupons } = body

  if (!shopId || !code || !amount) {
    return new Response(JSON.stringify({ error: 'shopId, code en amount zijn verplicht' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // Load shop credentials from Supabase (verify ownership)
  const { data: shop, error: shopErr } = await supabase
    .from('shops')
    .select('*')
    .eq('id', shopId)
    .eq('user_id', user.id)
    .single()

  if (shopErr || !shop) {
    return new Response(JSON.stringify({ error: 'Shop niet gevonden' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  const siteUrl = shop.site_url.replace(/\/$/, '')
  const auth = Buffer.from(`${shop.consumer_key}:${shop.consumer_secret}`).toString('base64')

  // Build coupon payload
  const now = new Date()
  // Start: 1 minute in the past to avoid timezone edge cases
  const startDate = new Date(now.getTime() - 60 * 1000)

  // Expiry date
  const expiryDate = use_schedule && expiry_hours
    ? new Date(now.getTime() + expiry_hours * 60 * 60 * 1000)
    : null

  // WooCommerce coupon payload
  const couponPayload = {
    code: code.toUpperCase(),
    discount_type: discount_type || 'percent',
    amount: String(amount),
    status: 'publish',
  }

  if (usage_limit) couponPayload.usage_limit = usage_limit
  if (usage_limit_per_user) couponPayload.usage_limit_per_user = usage_limit_per_user

  // date_expires is standard WooCommerce (ISO 8601)
  if (expiryDate) {
    couponPayload.date_expires = expiryDate.toISOString()
  }

  // For Advanced Coupons scheduler - add meta for start date scheduling
  // The Advanced Coupons plugin stores schedule data in coupon meta
  if (use_schedule && has_adv_coupons) {
    couponPayload.meta_data = [
      {
        key: 'acfw_schedule',
        value: {
          enabled: true,
          start_date: startDate.toISOString().slice(0, 16).replace('T', ' '),
          end_date: expiryDate ? expiryDate.toISOString().slice(0, 16).replace('T', ' ') : '',
          date_type: 'date_range',
        }
      }
    ]
  }

  try {
    const wooRes = await fetch(`${siteUrl}/wp-json/wc/v3/coupons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify(couponPayload),
    })

    const wooData = await wooRes.json()

    if (!wooRes.ok) {
      const errMsg = wooData?.message || wooData?.error || `WooCommerce fout ${wooRes.status}`
      return new Response(JSON.stringify({ error: errMsg }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const createdCode = wooData.code?.toUpperCase() || code.toUpperCase()

    // Build coupon URL - Advanced Coupons URL Coupons uses ?coupon= query parameter
    // Falls back to cart with coupon param even without the plugin
    const couponUrl = `${siteUrl}/?coupon=${encodeURIComponent(createdCode)}`

    return new Response(JSON.stringify({
      ok: true,
      coupon_code: createdCode,
      coupon_url: couponUrl,
      coupon_id: wooData.id,
      expires_at: expiryDate ? expiryDate.toISOString() : null,
      discount_type: wooData.discount_type,
      amount: wooData.amount,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('coupon-create error:', err)
    return new Response(JSON.stringify({ error: 'Verbinding met WooCommerce mislukt: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = { path: '/api/coupon-create' }
