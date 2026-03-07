import { createClient } from '@supabase/supabase-js'

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  // Verify superadmin token
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user || user.email !== 'leadingvation@gmail.com') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    // Get all user profiles
    const { data: profiles, error: profileErr } = await supabase
      .from('user_profiles')
      .select('*')
    if (profileErr) throw profileErr

    // Get all auth users (service role can do this)
    const { data: { users: authUsers }, error: authUsersErr } = await supabase.auth.admin.listUsers()
    if (authUsersErr) throw authUsersErr

    // Get shop counts per user
    const { data: shops } = await supabase.from('shops').select('user_id')
    const shopCounts = {}
    shops?.forEach(s => { shopCounts[s.user_id] = (shopCounts[s.user_id] || 0) + 1 })

    // Build email map from auth users
    const emailMap = {}
    authUsers?.forEach(u => { emailMap[u.id] = u.email })

    // Add any auth users not yet in profiles
    const profileIds = new Set((profiles || []).map(p => p.id))
    const extraUsers = (authUsers || [])
      .filter(u => !profileIds.has(u.id))
      .map(u => ({ id: u.id, full_name: u.user_metadata?.full_name || '', plan: 'pro', max_shops: 10, status: 'pending' }))

    const merged = [...(profiles || []), ...extraUsers].map(p => ({
      ...p,
      email: emailMap[p.id] || '',
      sites: shopCounts[p.id] || 0,
    }))

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('admin-users error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/admin-users' }
