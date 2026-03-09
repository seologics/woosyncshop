import { createClient } from '@supabase/supabase-js'

// Public endpoint — only returns a boolean, no sensitive data exposed
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let email
  try { ({ email } = await req.json()) } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (!email) {
    return new Response(JSON.stringify({ pending: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  )

  try {
    // Find the auth user by email
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const authUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!authUser) {
      return new Response(JSON.stringify({ pending: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Check if their profile has pending_payment
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('plan')
      .eq('id', authUser.id)
      .single()

    const pending = profile?.plan === 'pending_payment'
    return new Response(JSON.stringify({ pending }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    // Fail safe — don't expose errors, just return false
    return new Response(JSON.stringify({ pending: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/check-pending' }
