/**
 * POST /api/update-payment-method
 * Creates a new Mollie "first" payment to capture a fresh mandate.
 * On webhook success, the old subscription is cancelled and replaced.
 */
import { createClient } from '@supabase/supabase-js'

const MOLLIE_API = 'https://api.mollie.com/v2'
const PLAN_PRICES = {
  starter: { monthly: '7.99',  annual_mo: '7.19' },
  growth:  { monthly: '11.99', annual_mo: '10.79' },
  pro:     { monthly: '19.99', annual_mo: '17.99' },
}
const PLAN_NAMES = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }

async function mollieRequest(apiKey, path, method = 'GET', body = null) {
  const res = await fetch(`${MOLLIE_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { data: settings } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
    const mollieKey = settings?.mollie_api_key
    if (!mollieKey) return new Response(JSON.stringify({ error: 'Mollie niet geconfigureerd.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })

    const { data: profile } = await supabase.from('user_profiles').select(
      'plan, billing_period, mollie_customer_id, mollie_subscription_id, full_name'
    ).eq('id', user.id).single()

    if (!profile?.mollie_customer_id) {
      return new Response(JSON.stringify({ error: 'Geen Mollie klant gevonden.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const planKey = ['starter', 'growth', 'pro'].includes(profile.plan) ? profile.plan : 'growth'
    const billingKey = profile.billing_period === 'annual' ? 'annual_mo' : 'monthly'
    const amount = PLAN_PRICES[planKey][billingKey]
    const billingLabel = profile.billing_period === 'annual' ? 'jaarabonnement' : 'maandabonnement'

    // Create a new "first" payment — this captures a fresh payment mandate
    const payment = await mollieRequest(mollieKey, '/payments', 'POST', {
      amount: { currency: 'EUR', value: parseFloat(amount).toFixed(2) },
      description: `WooSyncShop ${PLAN_NAMES[planKey]} – ${billingLabel} (betaalmethode bijwerken)`,
      redirectUrl: `https://woosyncshop.com/#payment-method-updated`,
      webhookUrl: 'https://woosyncshop.com/api/mollie-webhook',
      customerId: profile.mollie_customer_id,
      sequenceType: 'first',
      metadata: {
        supabase_user_id: user.id,
        plan: planKey,
        billing_period: profile.billing_period || 'monthly',
        update_payment_method: 'true',
      },
    })

    if (!payment.id || !payment._links?.checkout?.href) {
      await supabase.from('system_logs').insert({ level: 'error', function_name: 'update-payment-method', message: `Mollie payment creation failed for user ${user.id}`, metadata: { detail: payment.detail || null } })
      return new Response(JSON.stringify({ error: payment.detail || 'Mollie betaling aanmaken mislukt.' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    await supabase.from('system_logs').insert({ level: 'info', function_name: 'update-payment-method', message: `Payment method update initiated for user ${user.id} (${planKey})`, metadata: { payment_id: payment.id, user_id: user.id } })

    return new Response(JSON.stringify({ checkout_url: payment._links.checkout.href, payment_id: payment.id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await supabase.from('system_logs').insert({ level: 'error', function_name: 'update-payment-method', message: `Exception: ${err.message}`, metadata: { user_id: user.id } })
    return new Response(JSON.stringify({ error: err.message || 'Onbekende fout' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/update-payment-method' }
