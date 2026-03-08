// netlify/functions/ean-assign.mjs
// GET                          → { available, used, total, alert_threshold }
// POST { sku, product_id }     → { ean }                    — assign next EAN
// POST { action:"import", eans:[...], filename } → { imported, skipped }  — bulk import
// POST { action:"export" }     → { rows: [{ean,sku,at,product_id},...] }  — export assigned
// POST { action:"set_threshold", threshold:N }  → { ok }   — save alert threshold
// DELETE { ean }               → { ok }                     — release EAN back to pool (admin)

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL"),
  Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS });

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function getUser(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

async function isSuperAdmin(user) {
  if (!user) return false;
  return user.email === Netlify.env.get("SUPERADMIN_EMAIL");
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const user = await getUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  // ── GET: pool status ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    // Use server-side counts to avoid Supabase's 1000-row default limit
    const [{ count: total, error: e1 }, { count: used, error: e2 }] = await Promise.all([
      supabase.from("ean_pool").select("*", { count: "exact", head: true }),
      supabase.from("ean_pool").select("*", { count: "exact", head: true }).not("assigned_sku", "is", null),
    ]);
    if (e1 || e2) return json({ error: (e1 || e2).message }, 500);
    const available = (total ?? 0) - (used ?? 0);

    const { data: ps } = await supabase
      .from("platform_settings")
      .select("ean_alert_threshold, ean_alert_email")
      .eq("id", 1)
      .single();

    return json({
      total: total ?? 0,
      used: used ?? 0,
      available,
      alert_threshold: ps?.ean_alert_threshold ?? 200,
      alert_email:     ps?.ean_alert_email     ?? "",
    });
  }

  // ── DELETE: release EAN back to pool ─────────────────────────────────────
  if (req.method === "DELETE") {
    if (!(await isSuperAdmin(user))) return json({ error: "Forbidden" }, 403);
    let body = {};
    try { body = await req.json(); } catch {}
    if (!body.ean) return json({ error: "Missing ean" }, 400);
    const { error } = await supabase
      .from("ean_pool")
      .update({ assigned_sku: null, assigned_at: null, product_id: null })
      .eq("ean", body.ean);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body = {};
  try { body = await req.json(); } catch {}

  // ── POST action: set_threshold ────────────────────────────────────────────
  if (body.action === "set_threshold") {
    if (!(await isSuperAdmin(user))) return json({ error: "Forbidden" }, 403);
    const t = parseInt(body.threshold);
    if (isNaN(t) || t < 0) return json({ error: "Invalid threshold" }, 400);
    const { error } = await supabase
      .from("platform_settings")
      .update({ ean_alert_threshold: t, ean_alert_email: body.alert_email || null })
      .eq("id", 1);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── POST action: export ───────────────────────────────────────────────────
  if (body.action === "export") {
    if (!(await isSuperAdmin(user))) return json({ error: "Forbidden" }, 403);
    const { data, error } = await supabase
      .from("ean_pool")
      .select("ean, assigned_sku, assigned_at, product_id")
      .order("assigned_at", { ascending: false, nullsFirst: false });
    if (error) return json({ error: error.message }, 500);
    return json({ rows: data });
  }

  // ── POST action: import ───────────────────────────────────────────────────
  if (body.action === "import") {
    if (!(await isSuperAdmin(user))) return json({ error: "Forbidden" }, 403);
    const eans = body.eans;
    if (!Array.isArray(eans) || eans.length === 0) return json({ error: "No EANs provided" }, 400);

    // Validate all are 13-digit numeric strings
    const valid = eans.filter(e => /^\d{13}$/.test(String(e)));
    if (valid.length === 0) return json({ error: "No valid EAN-13 codes found" }, 400);

    // Bulk upsert — ON CONFLICT DO NOTHING skips duplicates
    const rows = valid.map(e => ({ ean: String(e) }));
    const CHUNK = 500;
    let imported = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from("ean_pool")
        .upsert(chunk, { onConflict: "ean", ignoreDuplicates: true })
        .select("ean", { count: "exact" });
      if (error) return json({ error: error.message }, 500);
      imported += count || chunk.length;
    }
    const skipped = valid.length - imported;
    return json({ imported, skipped, total_valid: valid.length });
  }

  // ── POST: assign next available EAN ──────────────────────────────────────
  const { sku, product_id } = body;
  if (!sku) return json({ error: "Missing sku" }, 400);

  const { data, error } = await supabase.rpc("assign_next_ean", {
    p_sku: sku,
    p_product_id: product_id || null,
  });

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "EAN pool leeg — importeer nieuwe EAN-codes via Admin → Platform → EAN Pool." }, 422);

  // Check if we should send a low-stock alert after this assignment
  // (fire-and-forget, don't block the response)
  checkAndAlert(supabase).catch(() => {});

  return json({ ean: data });
};

async function checkAndAlert(sb) {
  const { data: ps } = await sb.from("platform_settings")
    .select("ean_alert_threshold, ean_alert_email, ean_last_alert_at")
    .eq("id", 1).single();
  if (!ps?.ean_alert_email || !ps?.ean_alert_threshold) return;

  const { data: pool } = await sb.from("ean_pool").select("assigned_sku");
  if (!pool) return;
  const available = pool.filter(r => !r.assigned_sku).length;
  if (available > ps.ean_alert_threshold) return;

  // Throttle: only send once per 24h
  const lastAlert = ps.ean_last_alert_at ? new Date(ps.ean_last_alert_at) : null;
  if (lastAlert && (Date.now() - lastAlert.getTime()) < 86400000) return;

  // Send low-stock alert via Amazon SES SMTP (same as send-invoice.mjs)
  const smtpUser = Netlify.env.get("AWS_SES_ACCESS_KEY_ID");
  const smtpPass = Netlify.env.get("AWS_SES_SMTP_PASSWORD");
  const smtpHost = `email-smtp.${Netlify.env.get("AWS_SES_REGION") || "eu-west-1"}.amazonaws.com`;
  const fromEmail = Netlify.env.get("FROM_EMAIL") || "info@woosyncshop.com";

  if (smtpUser && smtpPass) {
    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: smtpHost, port: 465, secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"WooSyncShop" <${fromEmail}>`,
      to: ps.ean_alert_email,
      subject: `⚠️ EAN Pool bijna leeg — nog ${available} codes beschikbaar`,
      html: `<p>Hallo,</p>
<p>De EAN-codepoel van WooSyncShop bevat nog slechts <strong>${available} beschikbare codes</strong> (drempelwaarde: ${ps.ean_alert_threshold}).</p>
<p>Importeer nieuwe EAN-codes via <strong>Admin → Platform → EAN Pool</strong> om te voorkomen dat productduplicatie stopt.</p>
<p>Bestel nieuwe codes op <a href="https://www.eankoning.com">eankoning.com</a> en upload het .xlsx-bestand in het beheerdersdashboard.</p>
<hr><p style="font-size:12px;color:#666">WooSyncShop · automatische melding</p>`,
    });
  }

  // Record that we sent the alert
  await sb.from("platform_settings")
    .update({ ean_last_alert_at: new Date().toISOString() })
    .eq("id", 1);
}

export const config = { path: "/api/ean-assign" };
