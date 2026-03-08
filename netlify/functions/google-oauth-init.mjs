// Initiates Google OAuth flow — redirects user to Google consent screen
// Required Netlify env vars: GOOGLE_CLIENT_ID

const SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export default async (req) => {
  try {
    const clientId = Netlify.env.get('GOOGLE_CLIENT_ID')
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'GOOGLE_CLIENT_ID not configured in Netlify env vars' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      })
    }

    const redirectUri = 'https://woosyncshop.com/api/google-oauth-callback'
    const state = Buffer.from(JSON.stringify({ ts: Date.now() })).toString('base64')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    return Response.redirect(authUrl, 302)
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = { path: '/api/google-oauth-init' }
