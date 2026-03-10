// Fetches available Google accounts/properties/sites for a shop
// using the tokens stored in the shops table for each service.
// Returns: { ads_connected, ads_accounts[], ga4_connected, ga4_properties[], sc_connected, sc_sites[], ... }

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

async function getUserFromToken(req) {
  const auth  = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) throw new Error('No token');
  const decoded = jwt.decode(token);
  if (!decoded?.sub) throw new Error('Invalid token');
  return decoded.sub; // user_id
}

async function refreshToken(clientId, clientSecret, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + (data.error || 'unknown'));
  return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
}

async function getValidToken(supabase, shop, field, refreshField, expiryField, connectedField) {
  if (!shop[connectedField]) return null;

  const clientId     = Netlify.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Netlify.env.get('GOOGLE_CLIENT_SECRET');

  // Check if expired (with 60s buffer)
  const expiry = shop[expiryField] ? new Date(shop[expiryField]) : null;
  const needsRefresh = !expiry || expiry.getTime() - Date.now() < 60_000;

  if (needsRefresh && shop[refreshField]) {
    try {
      const { accessToken, expiresIn } = await refreshToken(clientId, clientSecret, shop[refreshField]);
      const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
      await supabase.from('shops').update({
        [field]:   accessToken,
        [expiryField]: newExpiry,
      }).eq('id', shop.id);
      return accessToken;
    } catch {
      return shop[field] || null; // fall back to possibly stale token
    }
  }

  return shop[field] || null;
}

async function fetchAdsAccounts(accessToken, developerToken) {
  if (!accessToken) return [];
  try {
    const res = await fetch(
      'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
      {
        headers: {
          Authorization:        'Bearer ' + accessToken,
          'developer-token':    developerToken || '',
        },
      },
    );
    const data = await res.json();
    if (!res.ok || !data.resourceNames) return [];
    // Each resourceName is "customers/1234567890" — fetch details for each
    const accounts = await Promise.all(
      data.resourceNames.slice(0, 20).map(async (rn) => {
        const customerId = rn.replace('customers/', '');
        try {
          const detail = await fetch(
            `https://googleads.googleapis.com/v17/customers/${customerId}`,
            {
              headers: {
                Authorization:     'Bearer ' + accessToken,
                'developer-token': developerToken || '',
                'login-customer-id': customerId,
              },
            },
          );
          const d = await detail.json();
          return {
            id:    customerId,
            label: (d.descriptiveName || d.id || customerId) + ' (' + customerId + ')',
          };
        } catch {
          return { id: customerId, label: customerId };
        }
      }),
    );
    return accounts;
  } catch {
    return [];
  }
}

async function fetchGA4Properties(accessToken) {
  if (!accessToken) return [];
  try {
    const res = await fetch(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=50',
      { headers: { Authorization: 'Bearer ' + accessToken } },
    );
    const data = await res.json();
    if (!res.ok || !data.accountSummaries) return [];
    const props = [];
    for (const account of data.accountSummaries) {
      for (const prop of account.propertySummaries || []) {
        props.push({
          id:    prop.property.replace('properties/', ''),
          label: (prop.displayName || prop.property) + ' — ' + (account.displayName || account.account),
        });
      }
    }
    return props.slice(0, 50);
  } catch {
    return [];
  }
}

async function fetchSCSites(accessToken) {
  if (!accessToken) return [];
  try {
    const res = await fetch(
      'https://www.googleapis.com/webmasters/v3/sites',
      { headers: { Authorization: 'Bearer ' + accessToken } },
    );
    const data = await res.json();
    if (!res.ok || !data.siteEntry) return [];
    return data.siteEntry.map((s) => ({
      id:    s.siteUrl,
      label: s.siteUrl.replace('sc-domain:', '').replace('https://', '').replace('http://', ''),
    }));
  } catch {
    return [];
  }
}

export default async (req) => {
  try {
    const userId = await getUserFromToken(req);
    const url    = new URL(req.url);
    const shopId = url.searchParams.get('shop_id');
    if (!shopId) return new Response(JSON.stringify({ error: 'Missing shop_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Netlify.env.get('SUPABASE_URL'),
      Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Verify shop belongs to user
    const { data: shop, error: shopErr } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .eq('user_id', userId)
      .single();

    if (shopErr || !shop) {
      return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const devToken = Netlify.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') || '';

    // Get valid tokens (auto-refresh if needed)
    const [adsToken, ga4Token, scToken] = await Promise.all([
      getValidToken(supabase, shop, 'google_ads_access_token', 'google_ads_refresh_token', 'google_ads_token_expiry', 'google_ads_connected'),
      getValidToken(supabase, shop, 'ga4_access_token',        'ga4_refresh_token',        'ga4_token_expiry',        'ga4_connected'),
      getValidToken(supabase, shop, 'sc_access_token',         'sc_refresh_token',         'sc_token_expiry',         'sc_connected'),
    ]);

    // Fetch available accounts/properties in parallel
    const [adsAccounts, ga4Properties, scSites] = await Promise.all([
      adsToken ? fetchAdsAccounts(adsToken, devToken) : Promise.resolve([]),
      ga4Token ? fetchGA4Properties(ga4Token)         : Promise.resolve([]),
      scToken  ? fetchSCSites(scToken)                : Promise.resolve([]),
    ]);

    return new Response(JSON.stringify({
      ads_connected:     !!shop.google_ads_connected,
      ads_account_id:    shop.google_ads_account_id || null,
      ads_accounts:      adsAccounts,
      ga4_connected:     !!shop.ga4_connected,
      ga4_property_id:   shop.ga4_property_id || null,
      ga4_properties:    ga4Properties,
      sc_connected:      !!shop.sc_connected,
      sc_site:           shop.sc_site || null,
      sc_sites:          scSites,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/shop-google-data' };
