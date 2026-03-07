import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'
const MOLLIE_API = 'https://api.mollie.com/v2'

async function getMollieKey(supabase) {
  const { data } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
  return data?.mollie_api_key || null
}

async function mollieRequest(apiKey, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${MOLLIE_API}${path}`, opts)
  return res.json()
}

export default async (req) => {
  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const isAdmin = user.email === SUPERADMIN_EMAIL

  const mollieKey = await getMollieKey(supabase)
  if (!mollieKey) {
    return new Response(JSON.stringify({ error: 'Mollie API key not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }

  // ── GET ?type=methods: return available Mollie payment methods (admin only) ──
  const url = new URL(req.url, 'https://woosyncshop.com')
  if (req.method === 'GET' && url.searchParams.get('type') === 'methods') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    try {
      const data = await mollieRequest(mollieKey, '/methods?resource=payments&sequenceType=first&includeWallets=applepay')
      const methods = (data._embedded?.methods || []).map(m => ({ id: m.id, description: m.description, image: m.image?.size1x }))
      return new Response(JSON.stringify({ methods }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ── GET: admin gets all payments + stats, user gets own payments ────────────
  if (req.method === 'GET') {
    try {
      if (isAdmin) {
        // Fetch latest 50 payments
        const paymentsData = await mollieRequest(mollieKey, '/payments?limit=50')
        const payments = paymentsData._embedded?.payments || []

        // Compute stats
        const paid = payments.filter(p => p.status === 'paid')
        const pending = payments.filter(p => p.status === 'pending' || p.status === 'open')
        const mrr = paid.reduce((sum, p) => sum + parseFloat(p.amount?.value || 0), 0)

        // Get unique customer IDs
        const customerIds = new Set(payments.map(p => p.customerId).filter(Boolean))

        // Format payment list
        const list = payments.slice(0, 20).map(p => ({
          id: p.id,
          date: p.createdAt?.slice(0, 10),
          description: p.description || 'WooSyncShop Pro',
          amount: `€${parseFloat(p.amount?.value || 0).toFixed(2).replace('.', ',')}`,
          status: p.status,
          method: p.method || null,
          customerId: p.customerId || null,
        }))

        return new Response(JSON.stringify({
          stats: {
            mrr: mrr.toFixed(2),
            paidCount: paid.length,
            pendingCount: pending.length,
            totalCustomers: customerIds.size,
          },
          payments: list,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      } else {
        // Regular user: get their Mollie customer ID from profile
        const { data: profile } = await supabase.from('user_profiles').select('mollie_customer_id').eq('id', user.id).single()
        const customerId = profile?.mollie_customer_id
        if (!customerId) {
          return new Response(JSON.stringify({ payments: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        const data = await mollieRequest(mollieKey, `/customers/${customerId}/payments?limit=10`)
        const payments = (data._embedded?.payments || []).map(p => ({
          id: p.id,
          date: p.createdAt?.slice(0, 10),
          description: p.description || 'WooSyncShop Pro',
          amount: `€${parseFloat(p.amount?.value || 0).toFixed(2).replace('.', ',')}`,
          status: p.status,
        }))
        return new Response(JSON.stringify({ payments }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ── POST: create Mollie checkout URL for new subscription ──────────────────
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const { email, name, price_total, return_url, method } = body

      // 1. Create or reuse Mollie customer
      let customerId = null
      const { data: profile } = await supabase.from('user_profiles').select('mollie_customer_id').eq('id', user.id).single()

      if (profile?.mollie_customer_id) {
        customerId = profile.mollie_customer_id
      } else {
        const customer = await mollieRequest(mollieKey, '/customers', 'POST', {
          name: name || email,
          email: email,
          metadata: { supabase_user_id: user.id },
        })
        if (customer.id) {
          customerId = customer.id
          await supabase.from('user_profiles').update({ mollie_customer_id: customerId }).eq('id', user.id)
        }
      }

      // 2. Create first payment with sequenceType=first to set up mandate for recurring
      // Never pre-select a method — Mollie hosted checkout handles method selection
      // and automatically creates a SEPA Direct Debit mandate from iDEAL/Bancontact etc.
      const amount = price_total ? price_total.toString() : '19.99'
      const paymentBody = {
        amount: { currency: 'EUR', value: parseFloat(amount).toFixed(2) },
        description: 'WooSyncShop Pro – maandabonnement',
        redirectUrl: `${return_url || 'https://woosyncshop.com/#payment-return'}?pid=PENDING`,
        webhookUrl: 'https://woosyncshop.com/api/mollie-webhook',
        customerId: customerId,
        sequenceType: 'first',
        metadata: { supabase_user_id: user.id, plan: 'pro' },
      }
      // Pass selected method so user lands directly on their chosen payment form
      // sequenceType=first is compatible with: ideal, creditcard, directdebit, bancontact etc.
      if (method) paymentBody.method = method
      const payment = await mollieRequest(mollieKey, '/payments', 'POST', paymentBody)

      if (!payment.id || !payment._links?.checkout?.href) {
        return new Response(JSON.stringify({ error: payment.detail || 'Mollie payment creation failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

      // 3. Store pending payment ID on profile + also set plan to pending_payment
      await supabase.from('user_profiles').update({
        mollie_payment_id: payment.id,
        plan: 'pending_payment',
      }).eq('id', user.id)

      return new Response(JSON.stringify({
        checkout_url: payment._links.checkout.href,
        payment_id: payment.id,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config = { path: '/api/mollie-payments' }
