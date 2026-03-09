/**
 * GET /api/check-payment
 * Called when user returns from Mollie checkout (on #payment-return hash).
 *
 * Two responsibilities:
 * 1. Report the current payment status so the UI can react.
 * 2. Activate the plan as a fallback if Mollie says paid but the webhook
 *    hasn't fired yet (or failed silently). Uses the same idempotency guard
 *    as the webhook so double-activation is impossible.
 */
import { createClient } from '@supabase/supabase-js'

const ACTIVE_PLANS = ['starter', 'growth', 'pro', 'free_forever']

const PLAN_PRICES = {
  starter: { monthly: '7.99',  annual_mo: '7.19' },
  growth:  { monthly: '11.99', annual_mo: '10.79' },
  pro:     { monthly: '19.99', annual_mo: '17.99' },
}
const PLAN_NAMES = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }
const PLAN_LIMITS = {
  starter: { max_shops: 2,  max_connected_products: 500 },
  growth:  { max_shops: 5,  max_connected_products: 2000 },
  pro:     { max_shops: 10, max_connected_products: 10000 },
}

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('mollie_payment_id, plan, chosen_plan, billing_period, billing_cycle_start, mollie_customer_id, mollie_subscription_id, full_name')
      .eq('id', user.id)
      .single()

    // Already on an active plan — no action needed
    if (ACTIVE_PLANS.includes(profile?.plan)) {
      return ok({ status: 'paid', plan: profile.plan })
    }

    if (!profile?.mollie_payment_id) {
      return ok({ status: 'no_payment' })
    }

    // Get Mollie API key
    const { data: settings } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
    const mollieKey = settings?.mollie_api_key
    if (!mollieKey) return ok({ status: 'error', error: 'Mollie not configured' })

    // Fetch live payment status from Mollie
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${profile.mollie_payment_id}`, {
      headers: { Authorization: `Bearer ${mollieKey}` }
    })
    const payment = await mollieRes.json()

    if (payment.status !== 'paid') {
      // Not paid yet — return status as-is, no DB changes
      return ok({ status: payment.status, plan: profile.plan })
    }

    // ── Payment IS paid but plan not activated yet ─────────────────────────────
    // This is a fallback for when the webhook was slow or silently failed.
    // Guard with idempotency: check if this payment was already processed.
    // Only count ACTIVATION events — NOT 'registered'/'pending_upgrade' rows that
    // mollie-payments.mjs inserts when creating the checkout.
    const { data: existing } = await supabase
      .from('user_plan_history')
      .select('id')
      .eq('payment_id', profile.mollie_payment_id)
      .in('event_type', ['activated', 'renewal', 'upgraded', 'downgraded', 'payment_method_updated'])
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Webhook already activated this — re-read fresh profile (may have been a race)
      const { data: refreshed } = await supabase.from('user_profiles').select('plan').eq('id', user.id).single()
      return ok({ status: 'paid', plan: refreshed?.plan || profile.plan })
    }

    // ── Fallback activation ────────────────────────────────────────────────────
    const activatedPlan = ['starter', 'growth', 'pro'].includes(payment.metadata?.plan)
      ? payment.metadata.plan
      : (profile.chosen_plan && ['starter', 'growth', 'pro'].includes(profile.chosen_plan) ? profile.chosen_plan : 'growth')
    const billingPeriod = payment.metadata?.billing_period || profile.billing_period || 'monthly'
    const now = new Date().toISOString()

    const limits = PLAN_LIMITS[activatedPlan] || PLAN_LIMITS.growth
    await supabase.from('user_profiles').update({
      plan: activatedPlan,
      billing_period: billingPeriod,
      chosen_plan: activatedPlan,
      mollie_payment_id: profile.mollie_payment_id,
      mollie_customer_id: payment.customerId || profile.mollie_customer_id || null,
      billing_cycle_start: now,
      pending_downgrade_plan: null,
      pending_downgrade_billing_period: null,
      payment_reminder_sent_at: null, // clear so no reminder fires after payment
      max_shops: limits.max_shops,
      max_connected_products: limits.max_connected_products,
    }).eq('id', user.id)

    await supabase.from('user_plan_history').insert({
      user_id: user.id,
      event_type: 'activated',
      from_plan: null,
      to_plan: activatedPlan,
      billing_period: billingPeriod,
      payment_id: profile.mollie_payment_id,
      amount_paid: parseFloat(payment.amount?.value || 0),
      notes: `Plan geactiveerd via check-payment fallback (${payment.method || 'onbekend'})`,
    })

    await supabase.from('system_logs').insert({
      level: 'info',
      function_name: 'check-payment',
      message: `Fallback activation: user ${user.id} → ${activatedPlan} (payment ${profile.mollie_payment_id})`,
      metadata: { user_id: user.id, plan: activatedPlan, payment_id: profile.mollie_payment_id },
    })

    // Trigger subscription creation via internal call to webhook logic
    // (fire-and-forget — subscription is non-critical path)
    if (payment.customerId) {
      try {
        const priceKey = billingPeriod === 'annual' ? 'annual_mo' : 'monthly'
        const basePrice = parseFloat(PLAN_PRICES[activatedPlan]?.[priceKey] || '19.99')
        const chargeAmount = billingPeriod === 'annual' ? (basePrice * 12).toFixed(2) : basePrice.toFixed(2)
        const interval = billingPeriod === 'annual' ? '1 years' : '1 months'
        const nextBilling = new Date(now)
        billingPeriod === 'annual' ? nextBilling.setFullYear(nextBilling.getFullYear() + 1) : nextBilling.setMonth(nextBilling.getMonth() + 1)
        const startDate = nextBilling.toISOString().slice(0, 10)
        const billingLabel = billingPeriod === 'annual' ? 'jaarabonnement' : 'maandabonnement'

        const subRes = await fetch(`https://api.mollie.com/v2/customers/${payment.customerId}/subscriptions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${mollieKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: { currency: 'EUR', value: chargeAmount },
            interval,
            description: `WooSyncShop ${PLAN_NAMES[activatedPlan]} – ${billingLabel}`,
            webhookUrl: 'https://woosyncshop.com/api/mollie-webhook',
            startDate,
            metadata: { supabase_user_id: user.id, plan: activatedPlan, billing_period: billingPeriod },
          }),
        })
        const sub = await subRes.json()
        if (sub.id) {
          await supabase.from('user_profiles').update({ mollie_subscription_id: sub.id }).eq('id', user.id)
        }
      } catch (subErr) {
        await supabase.from('system_logs').insert({ level: 'warn', function_name: 'check-payment', message: `Subscription creation failed for user ${user.id}: ${subErr.message}` })
      }
    }

    // Trigger invoice (fire-and-forget)
    fetch('https://woosyncshop.com/api/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        payment_id: profile.mollie_payment_id,
        amount: payment.amount?.value,
        mollie_method: payment.method || null,
        plan: activatedPlan,
        billing_period: billingPeriod,
      }),
    }).catch(() => {})

    return ok({ status: 'paid', plan: activatedPlan })

  } catch (err) {
    console.error('check-payment error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

function ok(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export const config = { path: '/api/check-payment' }
