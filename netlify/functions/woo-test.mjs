import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Netlify.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

function writeLog(supabase, level, fnName, message, meta = {}) {
  return supabase.from("system_logs").insert([{
    level, function: fnName, message,
    metadata: meta, created_at: new Date().toISOString()
  }]).then(() => {});
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let body;

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400 });
  }

  let { site_url, consumer_key, consumer_secret, shop_id } = body;

  // ── If CK/CS are missing, look them up from Supabase by shop_id ──────────────
  // This handles plugin-connected shops where local React state may not yet
  // have the credentials that plugin-register.mjs wrote to the DB.
  if (shop_id && (!consumer_key || !consumer_secret)) {
    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .select("site_url, consumer_key, consumer_secret")
      .eq("id", shop_id)
      .single();

    if (shopErr || !shopRow) {
      return new Response(
        JSON.stringify({ ok: false, error: "Shop niet gevonden in database" }),
        { status: 404 }
      );
    }

    site_url      = site_url      || shopRow.site_url;
    consumer_key  = consumer_key  || shopRow.consumer_key;
    consumer_secret = consumer_secret || shopRow.consumer_secret;
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  if (!site_url || !consumer_key || !consumer_secret) {
    return new Response(
      JSON.stringify({ ok: false, error: "site_url, consumer_key and consumer_secret required" }),
      { status: 400 }
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
      await writeLog(supabase, "warn", "woo-test", `Connection failed: HTTP ${wooRes.status}`, { site_url, status: wooRes.status });
      return new Response(
        JSON.stringify({ ok: false, error: `HTTP ${wooRes.status}${txt ? ": " + txt.slice(0, 120) : ""}` }),
        { status: 200 }
      );
    }

    const data = await wooRes.json();
    const wc_version = data?.environment?.version || data?.wc_version || "?";
    const wp_version = data?.environment?.wp_version || "?";

    await writeLog(supabase, "info", "woo-test", `Connection OK: ${site_url}`, { wc_version, wp_version });

    return new Response(
      JSON.stringify({ ok: true, wc_version, wp_version }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    await writeLog(supabase, "error", "woo-test", `Connection error: ${err.message}`, { site_url });
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 200 }
    );
  }
};
