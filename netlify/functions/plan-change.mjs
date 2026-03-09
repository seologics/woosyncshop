import { createClient } from '@supabase/supabase-js'

const MOLLIE_API = 'https://api.mollie.com/v2'

const PLAN_PRICES = {
  starter: { monthly: 7.99,  annual_mo: 7.19  },
  growth:  { monthly: 11.99, annual_mo: 10.79 },
  pro:     { monthly: 19.99, annual_mo: 17.99 },
}
const PLAN_ORDER = { starter: 1, growth: 2, pro: 3 }

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

// Calculate proration: days remaining in current billing month × daily rate difference
function calcProration(cycleStart, currentPlan, newPlan, billingPeriod) {
  const priceKey = billingPeriod === 'annual' ? 'annual_mo' : 'monthly'
  const currentPrice = PLAN_PRICES[currentPlan]?.[priceKey] || 0
  const newPrice     = PLAN_PRICES[newPlan]?.[priceKey] || 0
  const diff = newPrice - currentPrice
  if (diff <= 0) return { amount: 0, days: 0, daysInMonth: 0 }

  const start = new Date(cycleStart)
  const now   = new Date()

  // Days elapsed since cycle start
  const msElapsed  = now - start
  const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24))

  // Days in the billing month (use the month of cycle start)
  const year  = start.getFullYear()
  const month = start.getMonth() // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const daysRemaining = Math.max(daysInMonth - daysElapsed, 1)
  const dailyDiff     = diff / daysInMonth
  const amount        = Math.max(parseFloat((dailyDiff * daysRemaining).toFixed(2)), 0.01)

  return { amount, days: daysRemaining, daysElapsed, daysInMonth }
}

export default async (req) => {
  if (!['POST', 'GET'].includes(req.method)) return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profile) return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

  // GET: return proration preview
  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://woosyncshop.com')
    const newPlan = url.searchParams.get('plan')
    const billingPeriod = url.searchParams.get('billing_period') || profile.billing_period || 'monthly'

    if (!PLAN_PRICES[newPlan]) {
      return new Response(JSON.stringify({ error: 'Ongeldig plan' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const currentPlan = profile.plan
    const currentOrder = PLAN_ORDER[currentPlan] || 0
    const newOrder     = PLAN_ORDER[newPlan] || 0

    if (newOrder === currentOrder) {
      return new Response(JSON.stringify({ same: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    if (newOrder < currentOrder) {
      // Downgrade — no charge, takes effect at next cycle
      const cycleStart  = profile.billing_cycle_start ? new Date(profile.billing_cycle_start) : new Date()
      const priceKey    = (profile.billing_period || 'monthly') === 'annual' ? 'annual_mo' : 'monthly'
      const daysInMonth = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 0).getDate()
      const daysElapsed = Math.floor((new Date() - cycleStart) / (1000 * 60 * 60 * 24))
      const daysRemaining = Math.max(daysInMonth - daysElapsed, 0)
      return new Response(JSON.stringify({
        action: 'downgrade',
        currentPlan, newPlan, billingPeriod,
        daysRemaining,
        effectiveDate: new Date(cycleStart.getTime() + daysInMonth * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        message: `Downgrade gaat in na ${daysRemaining} dag${daysRemaining !== 1 ? 'en' : ''}. Geen restitutie voor de resterende periode.`,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Upgrade — calculate proration
    if (!profile.billing_cycle_start) {
      // No cycle start yet: charge full price
      const priceKey = billingPeriod === 'annual' ? 'annual_mo' : 'monthly'
      return new Response(JSON.stringify({
        action: 'upgrade',
        currentPlan, newPlan, billingPeriod,
        amount: PLAN_PRICES[newPlan][priceKey].toFixed(2),
        days: null, daysInMonth: null,
        message: `Eerste betaling: €${PLAN_PRICES[newPlan][priceKey].toFixed(2)}`,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const proration = calcProration(profile.billing_cycle_start, currentPlan, newPlan, billingPeriod)
    return new Response(JSON.stringify({
      action: 'upgrade',
      currentPlan, newPlan, billingPeriod,
      amount: proration.amount.toFixed(2),
      days: proration.days,
      daysElapsed: proration.daysElapsed,
      daysInMonth: proration.daysInMonth,
      message: `${proration.days} resterende dag${proration.days !== 1 ? 'en' : ''} van ${proration.daysInMonth} — bijbetaling €${proration.amount.toFixed(2)}`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // POST: execute the change
  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }

    const { action, new_plan, billing_period, payment_method, return_url } = body

    if (!PLAN_PRICES[new_plan]) return new Response(JSON.stringify({ error: 'Ongeldig plan' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    try {
      const currentPlan   = profile.plan
      const currentOrder  = PLAN_ORDER[currentPlan] || 0
      const newOrder      = PLAN_ORDER[new_plan] || 0
      const effectiveBillingPeriod = billing_period || profile.billing_period || 'monthly'

      // ── DOWNGRADE ─────────────────────────────────────────────────────────────
      if (action === 'downgrade' || newOrder < currentOrder) {
        await supabase.from('user_profiles').update({
          pending_downgrade_plan: new_plan,
          pending_downgrade_billing_period: effectiveBillingPeriod,
        }).eq('id', user.id)

        await supabase.from('user_plan_history').insert({
          user_id: user.id,
          event_type: 'pending_downgrade',
          from_plan: currentPlan,
          to_plan: new_plan,
          billing_period: effectiveBillingPeriod,
          notes: 'Downgrade aangevraagd — geen restitutie, van kracht na huidig betalingstijdvak',
        })

        return new Response(JSON.stringify({ ok: true, action: 'downgrade_scheduled', new_plan }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // ── UPGRADE ───────────────────────────────────────────────────────────────
      const mollieKey = await getMollieKey(supabase)
      if (!mollieKey) return new Response(JSON.stringify({ error: 'Betaalgateway niet geconfigureerd' }), { status: 503, headers: { 'Content-Type': 'application/json' } })

      // Calculate proration amount
      const priceKey = effectiveBillingPeriod === 'annual' ? 'annual_mo' : 'monthly'
      let amount
      let proration = { days: null, daysInMonth: null }
      if (profile.billing_cycle_start) {
        proration = calcProration(profile.billing_cycle_start, currentPlan, new_plan, effectiveBillingPeriod)
        amount = proration.amount.toFixed(2)
      } else {
        amount = PLAN_PRICES[new_plan][priceKey].toFixed(2)
      }

      // Get or create Mollie customer
      let customerId = profile.mollie_customer_id || null
      if (!customerId) {
        // Get email from auth
        const { data: { users: authUserList } } = await supabase.auth.admin.listUsers()
        const authUser = authUserList?.find(u => u.id === user.id)
        const email = authUser?.email || profile.email || user.email || 'noreply@woosyncshop.com'
        const customer = await mollieRequest(mollieKey, '/customers', 'POST', {
          name: profile.full_name || email,
          email,
          metadata: { supabase_user_id: user.id },
        })
        if (customer.id) {
          customerId = customer.id
          await supabase.from('user_profiles').update({ mollie_customer_id: customerId }).eq('id', user.id)
        }
      }

      const planNames  = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }
      const description = `WooSyncShop upgrade ${planNames[currentPlan] || currentPlan} → ${planNames[new_plan] || new_plan}${proration.days ? ` (${proration.days}/${proration.daysInMonth} dagen)` : ''}`

      const paymentBody = {
        amount: { currency: 'EUR', value: amount },
        description,
        redirectUrl: return_url || 'https://woosyncshop.com/#payment-return',
        webhookUrl:  'https://woosyncshop.com/api/mollie-webhook',
        sequenceType: 'first',
        metadata: {
          supabase_user_id: user.id,
          plan: new_plan,
          billing_period: effectiveBillingPeriod,
          upgrade_from: currentPlan,
          proration_days: proration.days ? String(proration.days) : null,
        },
      }
      // Only add customerId and method if we have them
      if (customerId) paymentBody.customerId = customerId
      if (payment_method) paymentBody.method = payment_method

      const payment = await mollieRequest(mollieKey, '/payments', 'POST', paymentBody)

      if (!payment?.id || !payment?._links?.checkout?.href) {
        const detail = payment?.detail || payment?.message || JSON.stringify(payment)
        return new Response(JSON.stringify({ error: `Mollie: ${detail}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

      // Update profile: chosen_plan reflects new target, plan stays current until webhook fires
      await supabase.from('user_profiles').update({
        mollie_payment_id: payment.id,
        chosen_plan: new_plan,
      }).eq('id', user.id)

      // Log history (non-fatal — table may not exist yet if migration pending)
      try {
        await supabase.from('user_plan_history').insert({
          user_id: user.id,
          event_type: 'pending_upgrade',
          from_plan: currentPlan,
          to_plan: new_plan,
          billing_period: effectiveBillingPeriod,
          payment_id: payment.id,
          amount_paid: parseFloat(amount),
          proration_days: proration.days || null,
          notes: description,
        })
      } catch {}

      return new Response(JSON.stringify({ ok: true, checkout_url: payment._links.checkout.href, payment_id: payment.id, amount }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    } catch (err) {
      console.error('plan-change POST error:', err)
      return new Response(JSON.stringify({ error: err.message || 'Onbekende fout' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export const config = { path: '/api/plan-change' }
