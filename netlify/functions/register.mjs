import { createClient } from '@supabase/supabase-js'

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    const body = await req.json()
    const { email, password, metadata } = body

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'E-mail en wachtwoord zijn verplicht.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Wachtwoord moet minimaal 8 tekens zijn.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Check if user already exists
    const { data: { users: existing } } = await supabase.auth.admin.listUsers()
    const alreadyExists = existing?.some(u => u.email?.toLowerCase() === email.toLowerCase())
    if (alreadyExists) {
      return new Response(JSON.stringify({ error: 'Dit e-mailadres is al in gebruik.' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    }

    // Create user via admin API — email_confirm: true skips the confirmation email entirely
    const { data: { user }, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // <-- user is confirmed immediately, no email sent
      user_metadata: metadata || {},
    })

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Create user_profile row immediately so data is available
    if (user?.id && metadata) {
      await supabase.from('user_profiles').upsert({
        id: user.id,
        full_name: metadata.full_name || '',
        business_name: metadata.business_name || null,
        country: metadata.country || null,
        vat_number: metadata.vat_number || null,
        vat_validated: metadata.vat_validated || false,
        address_street: metadata.address_street || null,
        address_zip: metadata.address_zip || null,
        address_city: metadata.address_city || null,
        plan: metadata.plan || 'pro',
        price_total: metadata.price_total ? parseFloat(metadata.price_total) : null,
        vat_rate: metadata.vat_rate ? parseFloat(metadata.vat_rate) : 21,
      })
    }

    await supabase.from('system_logs').insert({
      level: 'info',
      function_name: 'register',
      message: `New user registered: ${email}`,
      metadata: { user_id: user?.id, plan: metadata?.plan || 'pro' },
    })

    return new Response(JSON.stringify({ ok: true, user_id: user?.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('register error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/register' }
