import { createClient } from '@supabase/supabase-js';

export const config = { path: '/api/plugin-register' };

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let body;
    try {
      body = JSON.parse(await req.text());
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { api_token, site_url, consumer_key, consumer_secret, site_id, locale } = body;

    if (!api_token || !site_url) {
      return new Response(JSON.stringify({ error: 'api_token and site_url are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Netlify.env.get('SUPABASE_URL'),
      Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Find shop by token
    const { data: shop, error: findError } = await supabase
      .from('shops')
      .select('id, user_id, name, site_url')
      .eq('api_token', api_token)
      .single();

    if (findError || !shop) {
      return new Response(JSON.stringify({ error: 'Invalid or unknown token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build updates
    const updates = {
      plugin_connected:    true,
      plugin_connected_at: new Date().toISOString(),
      site_url:            site_url.replace(/\/$/, ''),
    };
    if (consumer_key)    updates.consumer_key    = consumer_key;
    if (consumer_secret) updates.consumer_secret = consumer_secret;
    if (site_id)         updates.site_id         = site_id;
    if (locale)          updates.locale          = locale;

    const { error: updateError } = await supabase
      .from('shops')
      .update(updates)
      .eq('id', shop.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to update shop: ' + updateError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Log — use try/catch, NOT .catch() (Supabase v2 returns a thenable, not a real Promise)
    try {
      await supabase.from('system_logs').insert({
        level:         'info',
        function_name: 'plugin-register',
        message:       `Companion plugin connected for shop "${shop.name}" (${site_url})`,
        metadata:      { shop_id: shop.id, user_id: shop.user_id, site_url },
      });
    } catch { /* log failures are non-fatal */ }

    return new Response(JSON.stringify({
      success:   true,
      shop_id:   shop.id,
      shop_name: shop.name,
      message:   'Plugin successfully connected to WooSyncShop',
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error: ' + err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
