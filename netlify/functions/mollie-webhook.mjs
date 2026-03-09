import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const MOLLIE_API = 'https://api.mollie.com/v2'

async function sendInvoice(userId, paymentId, amount, method, plan, billingPeriod) {
  try {
    await fetch('https://woosyncshop.com/api/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, payment_id: paymentId, amount, mollie_method: method || null, plan, billing_period: billingPeriod }),
    })
  } catch (e) { console.error('mollie-webhook: invoice trigger failed', e.message) }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    const text = await req.text()
    const params = new URLSearchParams(text)
    const paymentId = params.get('id')
    if (!paymentId) return new Response('Missing payment id', { status: 400 })

    const { data: settings } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
    const mollieKey = settings?.mollie_api_key
    if (!mollieKey) return new Response('Not configured', { status: 503 })

    const res = await fetch(`${MOLLIE_API}/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mollieKey}` }
    })
    const payment = await res.json()

    const userId = payment.metadata?.supabase_user_id
    if (!userId) return new Response('OK', { status: 200 })

    // Get current profile for comparison
    const { data: profile } = await supabase.from('user_profiles').select('plan, chosen_plan, billing_period, billing_cycle_start, pending_downgrade_plan').eq('id', userId).single()

    if (payment.status === 'paid') {
      const activatedPlan = ['starter', 'growth', 'pro'].includes(payment.metadata?.plan) ? payment.metadata.plan : 'growth'
      const billingPeriod = payment.metadata?.billing_period || 'monthly'
      const isUpgrade = payment.metadata?.upgrade_from && payment.metadata.upgrade_from !== activatedPlan
      const now = new Date().toISOString()

      // Determine billing_cycle_start:
      // - First activation: set to now
      // - Upgrade mid-cycle: keep existing cycle start (paid remainder, cycle doesn't reset)
      const newCycleStart = isUpgrade && profile?.billing_cycle_start
        ? profile.billing_cycle_start
        : now

      await supabase.from('user_profiles').update({
        plan: activatedPlan,
        billing_period: billingPeriod,
        chosen_plan: activatedPlan,
        mollie_payment_id: paymentId,
        mollie_customer_id: payment.customerId || null,
        billing_cycle_start: newCycleStart,
        pending_downgrade_plan: null,
        pending_downgrade_billing_period: null,
      }).eq('id', userId)

      // Determine event type
      const prevActivePlan = profile?.plan === 'pending_payment' ? (profile?.chosen_plan || null) : (profile?.plan || null)
      let eventType = 'activated'
      if (prevActivePlan && prevActivePlan !== activatedPlan) {
        const planOrder = { starter: 1, growth: 2, pro: 3 }
        eventType = (planOrder[activatedPlan] || 0) > (planOrder[prevActivePlan] || 0) ? 'upgraded' : 'downgraded'
      }

      await supabase.from('user_plan_history').insert({
        user_id: userId,
        event_type: eventType,
        from_plan: prevActivePlan,
        to_plan: activatedPlan,
        billing_period: billingPeriod,
        payment_id: paymentId,
        amount_paid: parseFloat(payment.amount?.value || 0),
        proration_days: payment.metadata?.proration_days ? parseInt(payment.metadata.proration_days) : null,
        notes: isUpgrade
          ? `Upgrade van ${payment.metadata.upgrade_from} → ${activatedPlan} (bijbetaling resterende periode)`
          : `Plan geactiveerd via Mollie (${payment.method || 'onbekend'})`,
      })

      await supabase.from('system_logs').insert({
        level: 'info', function_name: 'mollie-webhook',
        message: `Payment ${paymentId} paid — user ${userId} → ${activatedPlan} (${eventType})`,
        metadata: { payment_id: paymentId, amount: payment.amount?.value, method: payment.method, event_type: eventType },
      })

      await sendInvoice(userId, paymentId, payment.amount?.value || '19.99', payment.method, activatedPlan, billingPeriod)

    } else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
      // On failure: revert to previous active plan (or keep pending if first time)
      const revertPlan = profile?.chosen_plan && profile.chosen_plan !== profile.plan
        ? profile.plan  // keep current plan; pending_payment stays if this was their first payment
        : profile?.plan

      await supabase.from('user_plan_history').insert({
        user_id: userId,
        event_type: 'cancelled',
        from_plan: profile?.plan,
        to_plan: profile?.chosen_plan || profile?.plan || 'pending_payment',
        billing_period: payment.metadata?.billing_period || 'monthly',
        payment_id: paymentId,
        amount_paid: 0,
        notes: `Betaling ${payment.status}: ${payment.metadata?.plan || '?'}`,
      })

      await supabase.from('system_logs').insert({
        level: 'warn', function_name: 'mollie-webhook',
        message: `Payment ${paymentId} ${payment.status} — user ${userId}`,
        metadata: { payment_id: paymentId, status: payment.status },
      })
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('mollie-webhook error:', err)
    return new Response('Error', { status: 500 })
  }
}

export const config = { path: '/api/mollie-webhook' }

