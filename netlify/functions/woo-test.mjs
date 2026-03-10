import { createClient } from "@supabase/supabase-js";

// Explicit path mapping — prevents 404 if netlify.toml redirect isn't matched
export const config = { path: "/api/woo-test" };

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }

  // Env vars must be read inside the handler, not at module level
  const SUPABASE_URL = Netlify.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  let { site_url, consumer_key, consumer_secret, shop_id } = body;

  // If CK/CS are missing, look them up fresh from Supabase by shop_id.
  // Handles plugin-connected shops where local React state may not yet have
  // the credentials that plugin-register.mjs wrote to the DB.
  if (shop_id && (!consumer_key || !consumer_secret)) {
    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .select("site_url, consumer_key, consumer_secret")
      .eq("id", shop_id)
      .single();

    if (shopErr || !shopRow) {
      return new Response(
        JSON.stringify({ ok: false, error: "Shop niet gevonden in database" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    site_url        = site_url        || shopRow.site_url;
    consumer_key    = consumer_key    || shopRow.consumer_key;
    consumer_secret = consumer_secret || shopRow.consumer_secret;
  }

  if (!site_url || !consumer_key || !consumer_secret) {
    return new Response(
      JSON.stringify({ ok: false, error: "site_url, consumer_key and consumer_secret required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const base = site_url.replace(/\/$/, "");

  try {
    const wooRes = await fetch(`${base}/wp-json/wc/v3/system_status`, {
      headers: {
        Authorization: "Basic " + btoa(`${consumer_key}:${consumer_secret}`),
        "Content-Type": "application/json",
      },
    });

    if (!wooRes.ok) {
      const txt = await wooRes.text().catch(() => "");
      return new Response(
        JSON.stringify({ ok: false, error: `HTTP ${wooRes.status}${txt ? ": " + txt.slice(0, 120) : ""}` }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await wooRes.json();
    const wc_version = data?.environment?.version || data?.wc_version || "?";
    const wp_version = data?.environment?.wp_version || "?";

    return new Response(
      JSON.stringify({ ok: true, wc_version, wp_version }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};
