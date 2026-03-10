// Google OAuth callback — exchanges auth code for tokens,
// saves access_token + refresh_token to the correct shop row.
// State param carries { service, shopId } encoded as base64 JSON.

import { createClient } from '@supabase/supabase-js';

const FIELD_MAP = {
  ads: {
    access_token:  'google_ads_access_token',
    refresh_token: 'google_ads_refresh_token',
    token_expiry:  'google_ads_token_expiry',
    connected:     'google_ads_connected',
  },
  ga4: {
    access_token:  'ga4_access_token',
    refresh_token: 'ga4_refresh_token',
    token_expiry:  'ga4_token_expiry',
    connected:     'ga4_connected',
  },
  sc: {
    access_token:  'sc_access_token',
    refresh_token: 'sc_refresh_token',
    token_expiry:  'sc_token_expiry',
    connected:     'sc_connected',
  },
};

export default async (req) => {
  const url   = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const redirect = (path) => Response.redirect('https://woosyncshop.com' + path, 302);

  if (error) {
    return redirect(`/#settings?google_oauth=error&reason=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return redirect('/#settings?google_oauth=error&reason=missing_params');
  }

  let service, shopId;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    service = decoded.service;
    shopId  = decoded.shopId;
  } catch {
    return redirect('/#settings?google_oauth=error&reason=invalid_state');
  }

  const fields = FIELD_MAP[service];
  if (!fields) {
    return redirect('/#settings?google_oauth=error&reason=unknown_service');
  }

  try {
    const clientId     = Netlify.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Netlify.env.get('GOOGLE_CLIENT_SECRET');
    const redirectUri  = 'https://woosyncshop.com/api/google-oauth-callback';

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();

    if (!tokenRes.ok || !tokens.access_token) {
      const reason = encodeURIComponent(tokens.error || 'token_exchange_failed');
      return redirect(`/#settings?google_oauth=error&shop_id=${shopId}&service=${service}&reason=${reason}`);
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    // Save tokens to shops table
    const supabase = createClient(
      Netlify.env.get('SUPABASE_URL'),
      Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const updatePayload = {
      [fields.access_token]:  tokens.access_token,
      [fields.refresh_token]: tokens.refresh_token || null,
      [fields.token_expiry]:  expiresAt,
      [fields.connected]:     true,
      updated_at: new Date().toISOString(),
    };

    const { error: dbErr } = await supabase
      .from('shops')
      .update(updatePayload)
      .eq('id', shopId);

    if (dbErr) {
      const reason = encodeURIComponent('db_save_failed: ' + dbErr.message);
      return redirect(`/#settings?google_oauth=error&shop_id=${shopId}&service=${service}&reason=${reason}`);
    }

    return redirect(`/#settings?google_oauth=success&shop_id=${shopId}&service=${service}`);
  } catch (err) {
    const reason = encodeURIComponent(err.message);
    return redirect(`/#settings?google_oauth=error&shop_id=${shopId}&service=${service}&reason=${reason}`);
  }
};

export const config = { path: '/api/google-oauth-callback' };
