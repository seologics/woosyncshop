import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'
const MOLLIE_API = 'https://api.mollie.com/v2'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'mollie-payments', message, metadata: meta }) } catch {}
}

async function getMollieKey(supabase) {
  const { data } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
  return data?.mollie_api_key || null
}

async function mollieRequest(apiKey, path, method = 'GET', body = null) {
  const opts = { method, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${MOLLIE_API}${path}`, opts)
  return res.json()
}

export default async (req) => {
  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const url = new URL(req.url, 'https://woosyncshop.com')

  // GET ?type=methods — public endpoint, no auth needed (method list is not sensitive)
  if (req.method === 'GET' && url.searchParams.get('type') === 'methods') {
    try {
      const mollieKey = await getMollieKey(supabase)
      if (!mollieKey) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      const data = await mollieRequest(mollieKey, '/methods?resource=payments&sequenceType=first&includeWallets=applepay')
      const methods = (data._embedded?.methods || []).map(m => ({ id: m.id, description: m.description, image: m.image }))
      return new Response(JSON.stringify(methods), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      await log(supabase, 'error', 'Failed to fetch Mollie payment methods', { error: err.message })
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const token = authHeader.slice(7)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const isAdmin = user.email === SUPERADMIN_EMAIL

  const mollieKey = await getMollieKey(supabase)
  if (!mollieKey) {
    await log(supabase, 'error', 'Mollie API key not configured', { user_id: user.id })
    return new Response(JSON.stringify({ error: 'Mollie API key not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }

  // GET: stats + payment history
  if (req.method === 'GET') {
    try {
      if (isAdmin) {
        const paymentsData = await mollieRequest(mollieKey, '/payments?limit=50')
        const payments = paymentsData._embedded?.payments || []
        const paid = payments.filter(p => p.status === 'paid')
        const pending = payments.filter(p => p.status === 'pending' || p.status === 'open')
        const mrr = paid.reduce((sum, p) => sum + parseFloat(p.amount?.value || 0), 0)
        const customerIds = new Set(payments.map(p => p.customerId).filter(Boolean))
        const list = payments.slice(0, 20).map(p => ({
          id: p.id, date: p.createdAt?.slice(0, 10), description: p.description || 'WooSyncShop Pro',
          amount: `€${parseFloat(p.amount?.value || 0).toFixed(2).replace('.', ',')}`,
          status: p.status, method: p.method || null, customerId: p.customerId || null,
        }))
        return new Response(JSON.stringify({ stats: { mrr: mrr.toFixed(2), paidCount: paid.length, pendingCount: pending.length, totalCustomers: customerIds.size }, payments: list }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      } else {
        const { data: profile } = await supabase.from('user_profiles').select('mollie_customer_id').eq('id', user.id).single()
        if (!profile?.mollie_customer_id) return new Response(JSON.stringify({ payments: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        const data = await mollieRequest(mollieKey, `/customers/${profile.mollie_customer_id}/payments?limit=10`)
        const payments = (data._embedded?.payments || []).map(p => ({
          id: p.id, date: p.createdAt?.slice(0, 10), description: p.description || 'WooSyncShop Pro',
          amount: `€${parseFloat(p.amount?.value || 0).toFixed(2).replace('.', ',')}`, status: p.status,
        }))
        return new Response(JSON.stringify({ payments }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    } catch (err) {
      await log(supabase, 'error', 'Failed to fetch Mollie payment data', { error: err.message, user_id: user.id })
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // POST: create checkout
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const { email, name, price_total, return_url, method, plan, billing_period } = body

      let customerId = null
      const { data: profile } = await supabase.from('user_profiles').select('mollie_customer_id').eq('id', user.id).single()

      if (profile?.mollie_customer_id) {
        customerId = profile.mollie_customer_id
      } else {
        const customer = await mollieRequest(mollieKey, '/customers', 'POST', { name: name || email, email, metadata: { supabase_user_id: user.id } })
        if (customer.id) {
          customerId = customer.id
          await supabase.from('user_profiles').update({ mollie_customer_id: customerId }).eq('id', user.id)
          await log(supabase, 'info', 'Mollie customer created', { user_id: user.id, customer_id: customerId, email })
        }
      }

      const PLAN_PRICES = {
        starter: { monthly: '7.99', annual_mo: '7.19' },
        growth:  { monthly: '11.99', annual_mo: '10.79' },
        pro:     { monthly: '19.99', annual_mo: '17.99' },
      }
      const planKey = plan && PLAN_PRICES[plan] ? plan : 'growth'
      const billingKey = billing_period === 'annual' ? 'annual_mo' : 'monthly'
      const amount = price_total ? price_total.toString() : PLAN_PRICES[planKey][billingKey]
      const planNames = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }
      const billingLabel = billing_period === 'annual' ? 'jaarabonnement' : 'maandabonnement'
      const description = `WooSyncShop ${planNames[planKey] || 'Pro'} – ${billingLabel}`
      const paymentBody = {
        amount: { currency: 'EUR', value: parseFloat(amount).toFixed(2) },
        description,
        redirectUrl: `${return_url || 'https://woosyncshop.com/#payment-return'}?pid=PENDING`,
        webhookUrl: 'https://woosyncshop.com/api/mollie-webhook',
        customerId,
        sequenceType: 'first',
        metadata: { supabase_user_id: user.id, plan: planKey, billing_period: billing_period || 'monthly' },
      }
      if (method) paymentBody.method = method

      const payment = await mollieRequest(mollieKey, '/payments', 'POST', paymentBody)

      if (!payment.id || !payment._links?.checkout?.href) {
        await log(supabase, 'error', 'Mollie payment creation failed', { user_id: user.id, email, amount, method: method || null, detail: payment.detail || null })
        return new Response(JSON.stringify({ error: payment.detail || 'Mollie payment creation failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

      await supabase.from('user_profiles').update({ mollie_payment_id: payment.id, plan: 'pending_payment', billing_period: billing_period || 'monthly' }).eq('id', user.id)
      await log(supabase, 'info', 'Mollie checkout created', { user_id: user.id, payment_id: payment.id, amount, method: method || null, customer_id: customerId })

      return new Response(JSON.stringify({ checkout_url: payment._links.checkout.href, payment_id: payment.id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      await log(supabase, 'error', 'Mollie checkout exception', { error: err.message, user_id: user.id })
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config = { path: '/api/mollie-payments' }
