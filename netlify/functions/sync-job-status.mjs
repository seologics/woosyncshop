// netlify/functions/sync-job-status.mjs
// GET /api/sync-job-status?id=<job_id>
// Returns current status of a background sync job from the sync_jobs table.

import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
  }

  const url = new URL(req.url, 'https://woosyncshop.com')
  const jobId = url.searchParams.get('id')
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: CORS })
  }

  const { data: job, error } = await supabase
    .from('sync_jobs')
    .select('id, status, done, total, current_product, result, error, created_at, updated_at')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single()

  if (error || !job) {
    return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: CORS })
  }

  return new Response(JSON.stringify(job), { status: 200, headers: CORS })
}

export const config = { path: '/api/sync-job-status' }
