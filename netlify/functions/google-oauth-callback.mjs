// Handles Google OAuth callback — exchanges code for tokens, stores in DB
// Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

export default async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error || !code) {
      return Response.redirect(`https://woosyncshop.com/?google_oauth=error&reason=${encodeURIComponent(error || 'no_code')}`, 302)
    }

    const clientId     = Netlify.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Netlify.env.get('GOOGLE_CLIENT_SECRET')
    const redirectUri  = 'https://woosyncshop.com/api/google-oauth-callback'

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()

    if (!tokenRes.ok || !tokens.access_token) {
      return Response.redirect(`https://woosyncshop.com/?google_oauth=error&reason=${encodeURIComponent(tokens.error || 'token_exchange_failed')}`, 302)
    }

    // Fetch user email for display
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    })
    const userInfo = await userRes.json()

    // Store tokens in platform_settings row 1
    const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()

    await supabase.from('platform_settings').upsert({
      id: 1,
      google_access_token:  tokens.access_token,
      google_refresh_token: tokens.refresh_token || null,
      google_token_expiry:  expiresAt,
      google_connected_email: userInfo.email || null,
      updated_at: new Date().toISOString(),
    })

    return Response.redirect('https://woosyncshop.com/?google_oauth=success', 302)
  } catch (err) {
    return Response.redirect(`https://woosyncshop.com/?google_oauth=error&reason=${encodeURIComponent(err.message)}`, 302)
  }
}

export const config = { path: '/api/google-oauth-callback' }
