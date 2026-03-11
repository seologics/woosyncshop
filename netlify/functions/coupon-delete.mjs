import { createClient } from '@supabase/supabase-js';

export const config = { path: '/api/coupon-delete' };

export default async (req) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const body = JSON.parse(await req.text());
    const { coupon_db_id, woo_coupon_id, shop_id } = body;

    const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    // Verify shop belongs to user, get credentials
    const { data: shop } = await supabase.from('shops').select('site_url, consumer_key, consumer_secret').eq('id', shop_id).eq('user_id', user.id).single();
    if (!shop) return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    // Delete from WooCommerce (force=true skips trash)
    if (woo_coupon_id && shop.consumer_key) {
      const auth = Buffer.from(`${shop.consumer_key}:${shop.consumer_secret}`).toString('base64');
      await fetch(`${shop.site_url}/wp-json/wc/v3/coupons/${woo_coupon_id}?force=true`, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${auth}` },
      }).catch(() => {}); // non-fatal if WC delete fails
    }

    // Delete from Supabase coupons table
    await supabase.from('coupons').delete().eq('id', coupon_db_id).eq('user_id', user.id);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error: ' + err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
