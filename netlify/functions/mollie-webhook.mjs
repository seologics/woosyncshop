import { createClient } from '@supabase/supabase-js'

const MOLLIE_API = 'https://api.mollie.com/v2'

const PLAN_PRICES = {
  starter: { monthly: '7.99',  annual_mo: '7.19' },
  growth:  { monthly: '11.99', annual_mo: '10.79' },
  pro:     { monthly: '19.99', annual_mo: '17.99' },
}
const PLAN_NAMES = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }

async function mollieGet(apiKey, path) {
  const res = await fetch(`${MOLLIE_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  return res.json()
}

async function molliePost(apiKey, path, body) {
  const res = await fetch(`${MOLLIE_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function mollieDelete(apiKey, path) {
  await fetch(`${MOLLIE_API}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` }
  })
}

async function sendInvoice(userId, paymentId, amount, method, plan, billingPeriod, upgradeFrom) {
  try {
    await fetch('https://woosyncshop.com/api/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId, payment_id: paymentId, amount,
        mollie_method: method || null, plan, billing_period: billingPeriod,
        upgrade_from: upgradeFrom || null,
      }),
    })
  } catch (e) { console.error('mollie-webhook: invoice trigger failed', e.message) }
}

async function sendDunningEmail(supabase, userId, email, fullName, plan, paymentId) {
  try {
    const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
    const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
    const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`
    const { default: nodemailer } = await import('nodemailer')
    const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })
    const firstName = (fullName || email || 'daar').split(' ')[0]
    const planName = PLAN_NAMES[plan] || plan
    await transporter.sendMail({
      from: '"WooSyncShop" <info@woosyncshop.com>',
      to: email,
      subject: `⚠ Betaling mislukt — je WooSyncShop ${planName} abonnement`,
      html: `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2d3056">
    <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#fff">WooSync<span style="color:#c4b5fd">Shop</span></div>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">Hoi ${firstName}, je betaling is mislukt ⚠</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">
        Je automatische betaling voor <strong style="color:#c4b5fd">WooSyncShop ${planName}</strong> kon niet worden verwerkt.
        Je toegang is tijdelijk opgeschort.
      </p>
      <div style="background:#0f1117;border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:16px 20px;margin:0 0 24px">
        <p style="margin:0;font-size:13px;color:#94a3b8">Mogelijke oorzaken: verlopen betaalmethode, onvoldoende saldo, of technisch probleem bij je bank.</p>
      </div>
      <div style="text-align:center;margin:0 0 8px">
        <a href="https://woosyncshop.com/?pay=1" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">Betaling bijwerken →</a>
      </div>
    </td></tr>
    <tr><td style="padding:20px 40px;border-top:1px solid #2d3056;text-align:center">
      <p style="margin:0;font-size:12px;color:#4b5563">WooSyncShop · Webs Media · De Wittenkade 152H · 1051 AN Amsterdam</p>
    </td></tr>
  </table></td></tr></table>
</body></html>`,
    })
  } catch (e) {
    console.error('mollie-webhook: dunning email failed', e.message)
    await supabase.from('system_logs').insert({ level: 'warn', function_name: 'mollie-webhook', message: `Dunning email failed for user ${userId}: ${e.message}` })
  }
}

async function createOrReplaceSubscription(supabase, mollieKey, customerId, userId, plan, billingPeriod, cycleStart, existingSubId) {
  try {
    // Cancel existing subscription if present
    if (existingSubId && customerId) {
      try {
        await mollieDelete(mollieKey, `/customers/${customerId}/subscriptions/${existingSubId}`)
        await supabase.from('system_logs').insert({ level: 'info', function_name: 'mollie-webhook', message: `Cancelled old subscription ${existingSubId} for user ${userId}` })
      } catch {}
    }

    if (!customerId) {
      await supabase.from('system_logs').insert({ level: 'warn', function_name: 'mollie-webhook', message: `Cannot create subscription for user ${userId}: no customerId` })
      return null
    }

    const priceKey = billingPeriod === 'annual' ? 'annual_mo' : 'monthly'
    const basePrice = parseFloat(PLAN_PRICES[plan]?.[priceKey] || '19.99')
    // Annual billing: charge annual total at once; monthly: charge monthly price
    const chargeAmount = billingPeriod === 'annual'
      ? (basePrice * 12).toFixed(2)
      : basePrice.toFixed(2)
    const interval = billingPeriod === 'annual' ? '1 years' : '1 months'

    // Next billing date = cycle start + 1 interval
    const cycleDate = new Date(cycleStart)
    const nextBilling = new Date(cycleDate)
    if (billingPeriod === 'annual') {
      nextBilling.setFullYear(nextBilling.getFullYear() + 1)
    } else {
      nextBilling.setMonth(nextBilling.getMonth() + 1)
    }
    const startDate = nextBilling.toISOString().slice(0, 10)
    const billingLabel = billingPeriod === 'annual' ? 'jaarabonnement' : 'maandabonnement'

    const sub = await molliePost(mollieKey, `/customers/${customerId}/subscriptions`, {
      amount: { currency: 'EUR', value: chargeAmount },
      interval,
      description: `WooSyncShop ${PLAN_NAMES[plan] || plan} – ${billingLabel}`,
      webhookUrl: 'https://woosyncshop.com/api/mollie-webhook',
      startDate,
      metadata: { supabase_user_id: userId, plan, billing_period: billingPeriod },
    })

    if (sub.id) {
      await supabase.from('user_profiles').update({ mollie_subscription_id: sub.id }).eq('id', userId)
      await supabase.from('system_logs').insert({
        level: 'info', function_name: 'mollie-webhook',
        message: `Subscription ${sub.id} created for user ${userId} — ${plan} ${billingPeriod}, starts ${startDate}`,
        metadata: { subscription_id: sub.id, plan, billing_period: billingPeriod, start_date: startDate, amount: chargeAmount },
      })
      return sub.id
    } else {
      await supabase.from('system_logs').insert({
        level: 'error', function_name: 'mollie-webhook',
        message: `Failed to create subscription for user ${userId}: ${sub.detail || sub.message || 'unknown'}`,
        metadata: { mollie_response: sub, plan, billing_period: billingPeriod },
      })
      return null
    }
  } catch (err) {
    console.error('mollie-webhook: createSubscription error', err.message)
    await supabase.from('system_logs').insert({ level: 'error', function_name: 'mollie-webhook', message: `Subscription creation exception for user ${userId}: ${err.message}` })
    return null
  }
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

    const payment = await mollieGet(mollieKey, `/payments/${paymentId}`)
    const isRecurring = !!payment.subscriptionId

    // Determine userId — recurring payments carry metadata too, but fallback to subscription lookup
    let userId = payment.metadata?.supabase_user_id
    let subscriptionPlan = payment.metadata?.plan
    let subscriptionBillingPeriod = payment.metadata?.billing_period

    // For subscription renewals, metadata may be on the subscription itself
    if (isRecurring && (!userId || !subscriptionPlan) && payment.customerId && payment.subscriptionId) {
      try {
        const sub = await mollieGet(mollieKey, `/customers/${payment.customerId}/subscriptions/${payment.subscriptionId}`)
        if (!userId) userId = sub.metadata?.supabase_user_id
        if (!subscriptionPlan) subscriptionPlan = sub.metadata?.plan
        if (!subscriptionBillingPeriod) subscriptionBillingPeriod = sub.metadata?.billing_period
      } catch {}
    }

    if (!userId) return new Response('OK', { status: 200 })

    // Get current profile
    const { data: profile } = await supabase.from('user_profiles').select(
      'plan, chosen_plan, billing_period, billing_cycle_start, pending_downgrade_plan, mollie_customer_id, mollie_subscription_id, full_name'
    ).eq('id', userId).single()

    // Get user email for notifications
    let userEmail = null
    try {
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
      userEmail = authUser?.email
    } catch {}

    // ── PAID ──────────────────────────────────────────────────────────────────
    if (payment.status === 'paid') {
      // ── IDEMPOTENCY: bail out if this payment was already ACTIVATED ──
      // NOTE: mollie-payments.mjs inserts 'registered'/'pending_upgrade' rows when
      // creating the checkout — those must NOT count as "already processed".
      const { data: existing } = await supabase
        .from('user_plan_history')
        .select('id')
        .eq('payment_id', paymentId)
        .in('event_type', ['activated', 'renewal', 'upgraded', 'downgraded', 'payment_method_updated'])
        .limit(1)
        .maybeSingle()
      if (existing) {
        // Already activated — return 200 so Mollie stops retrying
        return new Response('OK', { status: 200 })
      }

      // ── PAYMENT METHOD UPDATE (not a plan change — just replace mandate & subscription) ──
      if (payment.metadata?.update_payment_method === 'true') {
        const planForSub = payment.metadata?.plan || profile?.plan || 'growth'
        const bpForSub   = payment.metadata?.billing_period || profile?.billing_period || 'monthly'
        const cycleStart = profile?.billing_cycle_start || new Date().toISOString()
        await createOrReplaceSubscription(supabase, mollieKey, payment.customerId || profile?.mollie_customer_id, userId, planForSub, bpForSub, cycleStart, profile?.mollie_subscription_id)
        // Log in history for idempotency tracking (won't show as plan change in UI)
        await supabase.from('user_plan_history').insert({
          user_id: userId,
          event_type: 'payment_method_updated',
          from_plan: planForSub,
          to_plan: planForSub,
          billing_period: bpForSub,
          payment_id: paymentId,
          amount_paid: parseFloat(payment.amount?.value || 0),
          notes: `Betaalmethode bijgewerkt via Mollie (${payment.method || 'onbekend'})`,
        })
        await supabase.from('system_logs').insert({ level: 'info', function_name: 'mollie-webhook', message: `Payment method updated for user ${userId} — new subscription created`, metadata: { payment_id: paymentId, plan: planForSub } })
        return new Response('OK', { status: 200 })
      }

      const now = new Date().toISOString()
      const activatedPlan = ['starter', 'growth', 'pro'].includes(subscriptionPlan || payment.metadata?.plan)
        ? (subscriptionPlan || payment.metadata?.plan)
        : (profile?.plan && ['starter', 'growth', 'pro'].includes(profile.plan) ? profile.plan : 'growth')
      const billingPeriod = subscriptionBillingPeriod || payment.metadata?.billing_period || profile?.billing_period || 'monthly'
      const isUpgrade = payment.metadata?.upgrade_from && payment.metadata.upgrade_from !== activatedPlan

      let newCycleStart
      if (isRecurring) {
        // Renewal: advance cycle start to now
        newCycleStart = now
      } else if (isUpgrade && profile?.billing_cycle_start) {
        // Upgrade: keep existing cycle start (paid remainder, cycle doesn't reset)
        newCycleStart = profile.billing_cycle_start
      } else {
        // First activation
        newCycleStart = now
      }

      await supabase.from('user_profiles').update({
        plan: activatedPlan,
        billing_period: billingPeriod,
        chosen_plan: activatedPlan,
        mollie_payment_id: paymentId,
        mollie_customer_id: payment.customerId || profile?.mollie_customer_id || null,
        billing_cycle_start: newCycleStart,
        pending_downgrade_plan: null,
        pending_downgrade_billing_period: null,
        payment_reminder_sent_at: null, // clear so no reminder fires after payment
      }).eq('id', userId)

      // Determine history event type
      const prevActivePlan = profile?.plan === 'pending_payment'
        ? (profile?.chosen_plan || null)
        : (profile?.plan || null)

      let eventType
      if (isRecurring) {
        eventType = 'renewal'
      } else {
        const planOrder = { starter: 1, growth: 2, pro: 3 }
        if (!prevActivePlan || prevActivePlan === activatedPlan) {
          eventType = 'activated'
        } else {
          eventType = (planOrder[activatedPlan] || 0) > (planOrder[prevActivePlan] || 0) ? 'upgraded' : 'downgraded'
        }
      }

      await supabase.from('user_plan_history').insert({
        user_id: userId,
        event_type: eventType,
        from_plan: isRecurring ? activatedPlan : prevActivePlan,
        to_plan: activatedPlan,
        billing_period: billingPeriod,
        payment_id: paymentId,
        amount_paid: parseFloat(payment.amount?.value || 0),
        proration_days: payment.metadata?.proration_days ? parseInt(payment.metadata.proration_days) : null,
        notes: isRecurring
          ? `Automatische verlenging ${PLAN_NAMES[activatedPlan]} (${billingPeriod})`
          : isUpgrade
            ? `Upgrade van ${payment.metadata.upgrade_from} → ${activatedPlan} (bijbetaling resterende periode)`
            : `Plan geactiveerd via Mollie (${payment.method || 'onbekend'})`,
      })

      await supabase.from('system_logs').insert({
        level: 'info', function_name: 'mollie-webhook',
        message: `Payment ${paymentId} paid — user ${userId} → ${activatedPlan} (${eventType}${isRecurring ? ', recurring' : ''})`,
        metadata: { payment_id: paymentId, amount: payment.amount?.value, method: payment.method, event_type: eventType, is_recurring: isRecurring },
      })

      // Send invoice
      await sendInvoice(userId, paymentId, payment.amount?.value || '19.99', payment.method, activatedPlan, billingPeriod, payment.metadata?.upgrade_from || null)

      // Create/replace subscription — only for first payments (recurring payments already have a subscription)
      if (!isRecurring && payment.customerId) {
        await createOrReplaceSubscription(
          supabase, mollieKey,
          payment.customerId, userId,
          activatedPlan, billingPeriod,
          newCycleStart,
          profile?.mollie_subscription_id || null
        )
      }

    // ── FAILED / CANCELED / EXPIRED ───────────────────────────────────────────
    } else if (['failed', 'canceled', 'expired'].includes(payment.status)) {
      const eventPlan = subscriptionPlan || payment.metadata?.plan || profile?.plan

      if (isRecurring) {
        // Recurring payment failed → suspend user and send dunning email
        await supabase.from('user_profiles').update({
          plan: 'suspended',
          pending_downgrade_plan: null,
        }).eq('id', userId)

        await supabase.from('user_plan_history').insert({
          user_id: userId,
          event_type: 'suspended',
          from_plan: profile?.plan,
          to_plan: 'suspended',
          billing_period: profile?.billing_period || 'monthly',
          payment_id: paymentId,
          amount_paid: 0,
          notes: `Automatische verlenging mislukt (${payment.status}) — account opgeschort`,
        })

        if (userEmail) {
          await sendDunningEmail(supabase, userId, userEmail, profile?.full_name, eventPlan, paymentId)
        }

        await supabase.from('system_logs').insert({
          level: 'warn', function_name: 'mollie-webhook',
          message: `Recurring payment ${paymentId} ${payment.status} — user ${userId} suspended`,
          metadata: { payment_id: paymentId, status: payment.status, is_recurring: true },
        })
      } else {
        // First payment failed — keep pending_payment state, just log
        await supabase.from('user_plan_history').insert({
          user_id: userId,
          event_type: 'cancelled',
          from_plan: profile?.plan,
          to_plan: profile?.chosen_plan || profile?.plan || 'pending_payment',
          billing_period: payment.metadata?.billing_period || 'monthly',
          payment_id: paymentId,
          amount_paid: 0,
          notes: `Betaling ${payment.status}: ${eventPlan || '?'}`,
        })

        await supabase.from('system_logs').insert({
          level: 'warn', function_name: 'mollie-webhook',
          message: `Payment ${paymentId} ${payment.status} — user ${userId}`,
          metadata: { payment_id: paymentId, status: payment.status },
        })
      }
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('mollie-webhook error:', err)
    return new Response('Error', { status: 500 })
  }
}

export const config = { path: '/api/mollie-webhook' }
