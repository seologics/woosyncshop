// Saves a selected Google property ID to the shop row
// Body: { shop_id, google_ads_account_id | ga4_property_id | sc_site }

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const ALLOWED_FIELDS = [
  'google_ads_account_id',
  'ga4_property_id',
  'sc_site',
];

export default async (req) => {
  try {
    const auth  = req.headers.get('authorization') || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const decoded = jwt.decode(token);
    const userId  = decoded?.sub;
    if (!userId) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const body = await req.json();
    const { shop_id, ...rest } = body;

    if (!shop_id) return new Response(JSON.stringify({ error: 'Missing shop_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    // Only allow whitelisted fields
    const updateFields = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in rest) updateFields[field] = rest[field];
    }
    if (Object.keys(updateFields).length === 0) {
      return new Response(JSON.stringify({ error: 'No valid fields to update' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Netlify.env.get('SUPABASE_URL'),
      Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Verify shop belongs to user before updating
    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('id', shop_id)
      .eq('user_id', userId)
      .single();

    if (!shop) return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const { error } = await supabase
      .from('shops')
      .update({ ...updateFields, updated_at: new Date().toISOString() })
      .eq('id', shop_id);

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/shop-google-save' };
