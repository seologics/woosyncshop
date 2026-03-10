// Initiates Google OAuth for a specific shop + service
// ?service=ads|ga4|sc  &shop_id=<uuid>
// Encodes both in the OAuth state param so callback knows where to save

const SCOPES = {
  ads: [
    'https://www.googleapis.com/auth/adwords',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  ga4: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  sc: [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
};

export default async (req) => {
  try {
    const url     = new URL(req.url);
    const service = url.searchParams.get('service'); // ads|ga4|sc
    const shopId  = url.searchParams.get('shop_id');

    if (!service || !SCOPES[service]) {
      return new Response('Missing or invalid ?service= param', { status: 400 });
    }
    if (!shopId) {
      return new Response('Missing ?shop_id= param', { status: 400 });
    }

    const clientId = Netlify.env.get('GOOGLE_CLIENT_ID');
    if (!clientId) {
      return new Response('GOOGLE_CLIENT_ID not set in Netlify env', { status: 500 });
    }

    const redirectUri = 'https://woosyncshop.com/api/google-oauth-callback';
    const state = JSON.stringify({ service, shopId });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id',     clientId);
    authUrl.searchParams.set('redirect_uri',  redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope',         SCOPES[service].join(' '));
    authUrl.searchParams.set('access_type',   'offline');
    authUrl.searchParams.set('prompt',        'consent'); // always get refresh_token
    authUrl.searchParams.set('state',         Buffer.from(state).toString('base64'));

    return Response.redirect(authUrl.toString(), 302);
  } catch (err) {
    return new Response('OAuth init error: ' + err.message, { status: 500 });
  }
};

export const config = { path: '/api/google-oauth-init' };
