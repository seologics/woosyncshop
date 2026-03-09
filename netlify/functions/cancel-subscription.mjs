/**
 * POST /api/cancel-subscription
 * Cancels the user's Mollie subscription and schedules end-of-cycle access termination.
 * User keeps access until billing cycle ends (apply-downgrades handles the rest daily).
 */

import { createClient } from '@supabase/supabase-js'

const MOLLIE_API = 'https://api.mollie.com/v2'
const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

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

  try {
    const { data: profile } = await supabase.from('user_profiles').select(
      'plan, billing_period, billing_cycle_start, mollie_customer_id, mollie_subscription_id'
    ).eq('id', user.id).single()

    if (!profile) return new Response(JSON.stringify({ error: 'Profiel niet gevonden' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    const cancellablePlans = ['starter', 'growth', 'pro']
    if (!cancellablePlans.includes(profile.plan)) {
      return new Response(JSON.stringify({ error: 'Geen actief betaald abonnement gevonden.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Already cancelled
    if (profile.pending_downgrade_plan === 'cancelled') {
      return new Response(JSON.stringify({ error: 'Je abonnement is al opgezegd.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: settings } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
    const mollieKey = settings?.mollie_api_key

    // Cancel Mollie subscription (stop auto-renewal)
    if (mollieKey && profile.mollie_customer_id && profile.mollie_subscription_id) {
      try {
        await fetch(`${MOLLIE_API}/customers/${profile.mollie_customer_id}/subscriptions/${profile.mollie_subscription_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${mollieKey}` },
        })
        await supabase.from('system_logs').insert({
          level: 'info', function_name: 'cancel-subscription',
          message: `Mollie subscription ${profile.mollie_subscription_id} cancelled for user ${user.id}`,
        })
      } catch (subErr) {
        // Non-fatal — we still mark as cancelled in our DB
        await supabase.from('system_logs').insert({
          level: 'warn', function_name: 'cancel-subscription',
          message: `Could not cancel Mollie subscription ${profile.mollie_subscription_id}: ${subErr.message}`,
        })
      }
    }

    // Calculate end date (when they lose access)
    const cycleStart = profile.billing_cycle_start ? new Date(profile.billing_cycle_start) : new Date()
    const billingPeriod = profile.billing_period || 'monthly'
    const endDate = new Date(cycleStart)
    billingPeriod === 'annual'
      ? endDate.setFullYear(endDate.getFullYear() + 1)
      : endDate.setMonth(endDate.getMonth() + 1)
    const endDateStr = endDate.toISOString().slice(0, 10)

    // Mark for cancellation at cycle end
    await supabase.from('user_profiles').update({
      pending_downgrade_plan: 'cancelled',
      pending_downgrade_billing_period: billingPeriod,
      mollie_subscription_id: null, // already cancelled above
    }).eq('id', user.id)

    await supabase.from('user_plan_history').insert({
      user_id: user.id,
      event_type: 'pending_cancellation',
      from_plan: profile.plan,
      to_plan: 'cancelled',
      billing_period: billingPeriod,
      notes: `Opzegging aangevraagd — toegang tot en met ${endDateStr}`,
    })

    await supabase.from('system_logs').insert({
      level: 'info', function_name: 'cancel-subscription',
      message: `User ${user.id} cancelled subscription — access until ${endDateStr}`,
      metadata: { user_id: user.id, plan: profile.plan, end_date: endDateStr },
    })

    return new Response(JSON.stringify({
      ok: true,
      end_date: endDateStr,
      message: `Je abonnement is opgezegd. Je houdt toegang tot WooSyncShop tot en met ${new Date(endDateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('cancel-subscription error:', err)
    await supabase.from('system_logs').insert({
      level: 'error', function_name: 'cancel-subscription',
      message: `Exception for user ${user.id}: ${err.message}`,
    })
    return new Response(JSON.stringify({ error: err.message || 'Onbekende fout' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/cancel-subscription' }
