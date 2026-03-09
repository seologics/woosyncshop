/**
 * POST /api/update-password
 * Updates the authenticated user's password using the Supabase admin API.
 * Using admin API avoids email OTP confirmation flows and session disruption.
 */
import { createClient } from '@supabase/supabase-js'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  // Verify the caller's session
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { password } = await req.json()
    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Wachtwoord moet minimaal 8 tekens zijn.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Admin API update — no email confirmation, no session disruption
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, { password })
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    await supabase.from('system_logs').insert({
      level: 'info',
      function_name: 'update-password',
      message: `Password updated for user ${user.id}`,
      metadata: { user_id: user.id },
    })

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Onbekende fout' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/update-password' }
