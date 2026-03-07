import { createClient } from '@supabase/supabase-js'

export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    // Auth: get user from token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    const token = authHeader.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    // Get mollie_payment_id from user profile
    const { data: profile } = await supabase.from('user_profiles').select('mollie_payment_id, plan').eq('id', user.id).single()

    // Already paid — no need to check
    if (profile?.plan === 'pro' || profile?.plan === 'free_forever') {
      return new Response(JSON.stringify({ status: 'paid', plan: profile.plan }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    if (!profile?.mollie_payment_id) {
      return new Response(JSON.stringify({ status: 'no_payment' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Get Mollie API key
    const { data: settings } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
    const mollieKey = settings?.mollie_api_key
    if (!mollieKey) {
      return new Response(JSON.stringify({ error: 'Mollie not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    // Check payment status with Mollie
    const res = await fetch(`https://api.mollie.com/v2/payments/${profile.mollie_payment_id}`, {
      headers: { Authorization: `Bearer ${mollieKey}` }
    })
    const payment = await res.json()

    return new Response(JSON.stringify({
      status: payment.status,   // paid | open | canceled | expired | failed | pending
      plan: profile.plan,
      method: payment.method,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/check-payment' }
