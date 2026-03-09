import { createClient } from '@supabase/supabase-js'

const SUPERADMIN = 'leadingvation@gmail.com'
const LOG_TTL_DAYS = 7

export default async (req) => {
  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  )

  // Auth — superadmin only
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user || user.email !== SUPERADMIN) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'DELETE') {
    // Manual clear all logs
    await supabase.from('system_logs').delete().lt('created_at', new Date().toISOString())
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'GET') {
    // Auto-cleanup logs older than 7 days on every read
    const cutoff = new Date(Date.now() - LOG_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('system_logs').delete().lt('created_at', cutoff)

    const url = new URL(req.url)
    const level = url.searchParams.get('level')
    const fn = url.searchParams.get('fn')
    const limit = parseInt(url.searchParams.get('limit') || '200')

    let query = supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (level && level !== 'all') query = query.eq('level', level)
    if (fn && fn !== 'all') query = query.eq('function_name', fn)

    const { data, error } = await query
    if (error) {
      // Table may not exist yet — return empty array with header hint
      console.error('system_logs query error:', error.message)
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Logs-Error': error.message } })
    }

    return new Response(JSON.stringify(data || []), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config = { path: '/api/system-logs' }
