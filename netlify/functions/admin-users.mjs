import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'

export default async (req) => {
  if (!['GET', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user || user.email !== SUPERADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  // PATCH: archive / unarchive
  if (req.method === 'PATCH') {
    try {
      const { id, archived } = await req.json()
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const updates = { archived: archived !== false, archived_at: archived !== false ? new Date().toISOString() : null }
      if (archived !== false) updates.plan = 'suspended'
      const { error } = await supabase.from('user_profiles').update(updates).eq('id', id)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      await supabase.from('system_logs').insert({ level: 'warn', function_name: 'admin-users', message: `User ${id} ${archived !== false ? 'archived' : 'unarchived'}`, metadata: { user_id: id } })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }) }
  }

  // DELETE: permanent delete
  if (req.method === 'DELETE') {
    try {
      const { id } = await req.json()
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      await supabase.from('user_profiles').delete().eq('id', id)
      const { error: authDelErr } = await supabase.auth.admin.deleteUser(id)
      if (authDelErr) return new Response(JSON.stringify({ error: authDelErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      await supabase.from('system_logs').insert({ level: 'warn', function_name: 'admin-users', message: `User ${id} permanently deleted`, metadata: { user_id: id } })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }) }
  }

  // PUT: update profile
  if (req.method === 'PUT') {
    try {
      const body = await req.json()
      const { id, ...updates } = body
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const allowed = {
        plan: updates.plan,
        max_shops: updates.max_shops != null ? parseInt(updates.max_shops) : undefined,
        max_connected_products: updates.max_connected_products != null ? parseInt(updates.max_connected_products) : undefined,
        is_admin: updates.is_admin ?? undefined,
        ai_taxonomy_enabled: updates.ai_taxonomy_enabled ?? undefined,
        ai_taxonomy_model: updates.ai_taxonomy_model || undefined,
        ai_taxonomy_threshold: updates.ai_taxonomy_threshold != null ? parseFloat(updates.ai_taxonomy_threshold) : undefined,
        gemini_model: updates.gemini_model || undefined,
        img_max_kb: updates.img_max_kb != null ? parseInt(updates.img_max_kb) : undefined,
        img_quality: updates.img_quality != null ? parseInt(updates.img_quality) : undefined,
        img_max_width: updates.img_max_width != null ? parseInt(updates.img_max_width) : undefined,
      }
      Object.keys(allowed).forEach(k => allowed[k] === undefined && delete allowed[k])
      const { error } = await supabase.from('user_profiles').update(allowed).eq('id', id)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }) }
  }

  // GET: list all users
  try {
    const { data: profiles, error: profileErr } = await supabase.from('user_profiles').select('*')
    if (profileErr) throw profileErr
    const { data: { users: authUsers }, error: authUsersErr } = await supabase.auth.admin.listUsers()
    if (authUsersErr) throw authUsersErr
    const { data: shops } = await supabase.from('shops').select('user_id')
    const shopCounts = {}
    shops?.forEach(s => { shopCounts[s.user_id] = (shopCounts[s.user_id] || 0) + 1 })
    const emailMap = {}
    authUsers?.forEach(u => { emailMap[u.id] = u.email })
    const profileIds = new Set((profiles || []).map(p => p.id))
    const extraUsers = (authUsers || []).filter(u => !profileIds.has(u.id)).map(u => ({ id: u.id, full_name: u.user_metadata?.full_name || '', plan: 'pro', max_shops: 10, status: 'pending' }))
    const merged = [...(profiles || []), ...extraUsers].map(p => ({ ...p, email: emailMap[p.id] || '', sites: shopCounts[p.id] || 0 }))
    return new Response(JSON.stringify(merged), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/admin-users' }
