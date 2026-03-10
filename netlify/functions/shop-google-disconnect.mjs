// Disconnects a specific Google service from a shop
// Body: { shop_id, service: "ads"|"ga4"|"sc" }
// Clears tokens + connected flag from shops table

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const SERVICE_FIELDS = {
  ads: [
    'google_ads_access_token',
    'google_ads_refresh_token',
    'google_ads_token_expiry',
    'google_ads_connected',
    'google_ads_account_id',
  ],
  ga4: [
    'ga4_access_token',
    'ga4_refresh_token',
    'ga4_token_expiry',
    'ga4_connected',
    'ga4_property_id',
  ],
  sc: [
    'sc_access_token',
    'sc_refresh_token',
    'sc_token_expiry',
    'sc_connected',
    'sc_site',
  ],
};

export default async (req) => {
  try {
    const auth  = req.headers.get('authorization') || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const decoded = jwt.decode(token);
    const userId  = decoded?.sub;
    if (!userId) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const { shop_id, service } = await req.json();

    if (!shop_id) return new Response(JSON.stringify({ error: 'Missing shop_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    if (!SERVICE_FIELDS[service]) return new Response(JSON.stringify({ error: 'Invalid service' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Netlify.env.get('SUPABASE_URL'),
      Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Verify ownership
    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('id', shop_id)
      .eq('user_id', userId)
      .single();

    if (!shop) return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    // Build null-out payload for all service fields
    const clearPayload = {};
    for (const field of SERVICE_FIELDS[service]) {
      clearPayload[field] = null;
    }
    // connected flag should be false, not null
    const connectedField = SERVICE_FIELDS[service].find(f => f.endsWith('_connected'));
    if (connectedField) clearPayload[connectedField] = false;

    clearPayload.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('shops')
      .update(clearPayload)
      .eq('id', shop_id);

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/shop-google-disconnect' };
