// Called by the WooSyncShop Companion plugin when it first connects.
// The plugin sends the api_token (generated when the shop was added) along
// with its site details and WooCommerce REST API credentials.
//
// Flow:
//   1. User adds shop in WooSyncShop → api_token generated, shown in shop card
//   2. User installs companion plugin on their WordPress site
//   3. User pastes the api_token into the plugin settings → plugin POSTs here
//   4. We match the token to the shop row and update it with site info + credentials

import { createClient } from '@supabase/supabase-js';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    const text = await req.text();
    body = JSON.parse(text);
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

  // Find the shop by token
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

  // Update the shop with the info the plugin provides
  const updates = {
    plugin_connected: true,
    plugin_connected_at: new Date().toISOString(),
  };
  if (site_url) updates.site_url = site_url.replace(/\/$/, '');
  if (consumer_key) updates.consumer_key = consumer_key;
  if (consumer_secret) updates.consumer_secret = consumer_secret;
  if (site_id) updates.site_id = site_id;
  if (locale) updates.locale = locale;

  const { error: updateError } = await supabase
    .from('shops')
    .update(updates)
    .eq('id', shop.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to update shop' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Log it
  await supabase.from('system_logs').insert({
    level: 'info',
    action: 'plugin-register',
    message: `Companion plugin connected for shop "${shop.name}" (${site_url})`,
    details: JSON.stringify({ shop_id: shop.id, user_id: shop.user_id, site_url }),
  }).catch(() => {});

  return new Response(JSON.stringify({
    success: true,
    shop_id: shop.id,
    shop_name: shop.name,
    message: 'Plugin successfully connected to WooSyncShop',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/plugin-register' };
