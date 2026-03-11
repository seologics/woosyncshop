import { createClient } from '@supabase/supabase-js'

// Inline log helper
async function writeLog(supabase, functionName, level, message, meta = {}) {
  try {
    await supabase.from('system_logs').insert({
      function_name: functionName,
      level,
      message,
      meta: Object.keys(meta).length ? meta : null,
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('writeLog failed:', e.message)
  }
}


export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
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

  const { data: shop, error: shopErr } = await supabase
    .from('shops').select('*').eq('id', shopId).eq('user_id', user.id).single()

  if (shopErr || !shop) {
    await writeLog(supabase, 'coupon-create', 'error', 'Shop not found or unauthorized', { shopId, userId: user.id })
    return new Response(JSON.stringify({ error: 'Shop niet gevonden' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  const siteUrl = shop.site_url.replace(/\/$/, '')
  const auth = Buffer.from(`${shop.consumer_key}:${shop.consumer_secret}`).toString('base64')
  const now = new Date()
  const startDate = new Date(now.getTime() - 60 * 1000)
  const expiryDate = use_schedule && expiry_hours ? new Date(now.getTime() + expiry_hours * 60 * 60 * 1000) : null

  // Format a Date as a local datetime string in the shop's timezone (no timezone suffix)
  // WooCommerce date_expires and acfw_schedule expect local site time, not UTC
  // WordPress may store timezone as "UTC+1" / "UTC-5" — convert to proper IANA offset string
  const rawTz = shop.timezone || 'Europe/Amsterdam';
  const resolveTimezone = (tz) => {
    const m = tz.match(/^UTC([+-])(\d+)(?:\.(5))?$/);
    if (!m) return tz; // already an IANA name
    const sign = m[1];
    const hours = m[2].padStart(2, '0');
    const mins = m[3] ? '30' : '00';
    // Etc/GMT uses inverted sign convention
    const etcSign = sign === '+' ? '-' : '+';
    const ianaGuess = `Etc/GMT${etcSign}${parseInt(m[2])}`;
    try { new Intl.DateTimeFormat('en', { timeZone: ianaGuess }); return ianaGuess; }
    catch { return 'Europe/Amsterdam'; }
  };
  const shopTimezone = resolveTimezone(rawTz);
  const toShopTime = (d) =>
    d.toLocaleString('sv-SE', { timeZone: shopTimezone }).replace('T', ' ').slice(0, 16)

  const couponPayload = {
    code: code.toUpperCase(),
    discount_type: discount_type || 'percent',
    amount: String(amount),
    status: 'publish',
  }
  if (usage_limit) couponPayload.usage_limit = usage_limit
  if (usage_limit_per_user) couponPayload.usage_limit_per_user = usage_limit_per_user
  // Use date_expires_gmt so WooCommerce stores the correct UTC moment regardless of site timezone
  if (expiryDate) couponPayload.date_expires_gmt = expiryDate.toISOString().replace('.000Z', '')
  if (use_schedule && has_adv_coupons) {
    // Advanced Coupons reads acfw_schedule from wp_postmeta as a serialized PHP array.
    // The WooCommerce REST API must receive the value as a JSON *string* — not a nested
    // object — otherwise WP stores it as a plain object which ACFW can't unserialize,
    // leaving the Scheduler checkbox unchecked with no dates.
    couponPayload.meta_data = [{
      key: 'acfw_schedule',
      value: JSON.stringify({
        enabled: '1',
        start_date: toShopTime(startDate),
        end_date: expiryDate ? toShopTime(expiryDate) : '',
        date_type: 'date_range',
      })
    }]
  }

  try {
    const wooRes = await fetch(`${siteUrl}/wp-json/wc/v3/coupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body: JSON.stringify(couponPayload),
    })
    const wooData = await wooRes.json()
    if (!wooRes.ok) {
      const errMsg = wooData?.message || `WooCommerce fout ${wooRes.status}`
      await writeLog(supabase, 'coupon-create', 'error', 'WooCommerce coupon create failed', {
        status: wooRes.status, wooMessage: errMsg, code, siteUrl
      })
      return new Response(JSON.stringify({ error: errMsg }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const createdCode = wooData.code?.toUpperCase() || code.toUpperCase()
    const couponUrl = `${siteUrl}/?coupon=${encodeURIComponent(createdCode)}`
    const expiresAt = expiryDate ? expiryDate.toISOString() : null

    // Persist to coupons table for history view
    try {
      await supabase.from('coupons').insert({
        user_id:       user.id,
        shop_id:       shopId,
        woo_coupon_id: wooData.id,
        code:          createdCode,
        discount_type: wooData.discount_type,
        amount:        parseFloat(wooData.amount) || 0,
        coupon_url:    couponUrl,
        expires_at:    expiresAt,
        created_at:    new Date().toISOString(),
      });
    } catch { /* non-fatal */ }

    await writeLog(supabase, 'coupon-create', 'info', 'Coupon created', { code: createdCode, siteUrl, userId: user.id })
    return new Response(JSON.stringify({
      ok: true, coupon_code: createdCode, coupon_url: couponUrl,
      coupon_id: wooData.id, expires_at: expiresAt,
      discount_type: wooData.discount_type, amount: wooData.amount,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await writeLog(supabase, 'coupon-create', 'error', 'WooCommerce connection failed', { error: err.message, siteUrl })
    return new Response(JSON.stringify({ error: 'Verbinding mislukt: ' + err.message }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/coupon-create' }
