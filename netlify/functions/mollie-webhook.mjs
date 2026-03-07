import { createClient } from '@supabase/supabase-js'

const MOLLIE_API = 'https://api.mollie.com/v2'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    // Mollie sends form-encoded body with just "id"
    const text = await req.text()
    const params = new URLSearchParams(text)
    const paymentId = params.get('id')

    if (!paymentId) {
      return new Response('Missing payment id', { status: 400 })
    }

    // Get Mollie API key
    const { data: settings } = await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()
    const mollieKey = settings?.mollie_api_key
    if (!mollieKey) {
      console.error('mollie-webhook: no api key configured')
      return new Response('Not configured', { status: 503 })
    }

    // Fetch payment details from Mollie
    const res = await fetch(`${MOLLIE_API}/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mollieKey}` }
    })
    const payment = await res.json()

    const userId = payment.metadata?.supabase_user_id
    if (!userId) {
      console.error('mollie-webhook: no supabase_user_id in payment metadata', paymentId)
      return new Response('OK', { status: 200 })
    }

    if (payment.status === 'paid') {
      // Activate the user plan
      await supabase.from('user_profiles').update({
        plan: 'pro',
        mollie_payment_id: paymentId,
        mollie_customer_id: payment.customerId || null,
      }).eq('id', userId)

      // Log it
      await supabase.from('system_logs').insert({
        level: 'info',
        function_name: 'mollie-webhook',
        message: `Payment ${paymentId} paid — user ${userId} activated`,
        metadata: { payment_id: paymentId, amount: payment.amount?.value, method: payment.method },
      })
    } else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
      // Log failed payment
      await supabase.from('system_logs').insert({
        level: 'warn',
        function_name: 'mollie-webhook',
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
