// netlify/functions/ean-assign.mjs
// Atomically assigns the next available EAN from the pool to a product.
// POST  { sku, product_id } → { ean }
// GET   (no body)           → { available, used, total }

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

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Auth: must be logged-in user ──────────────────────────────────────────
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });

  // ── GET: pool status ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("ean_pool")
      .select("ean, assigned_sku", { count: "exact" });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
    const total     = data.length;
    const used      = data.filter(r => r.assigned_sku).length;
    const available = total - used;
    return new Response(JSON.stringify({ total, used, available }), { status: 200, headers: CORS });
  }

  // ── POST: assign next available EAN ──────────────────────────────────────
  if (req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch {}
    const { sku, product_id } = body;
    if (!sku) return new Response(JSON.stringify({ error: "Missing sku" }), { status: 400, headers: CORS });

    // Atomic: select first unassigned EAN and immediately lock + update it
    // We use a Postgres RPC to avoid race conditions between concurrent requests
    const { data, error } = await supabase.rpc("assign_next_ean", {
      p_sku: sku,
      p_product_id: product_id || null,
    });

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
    if (!data) return new Response(JSON.stringify({ error: "EAN pool leeg — voeg nieuwe EAN-codes toe." }), { status: 422, headers: CORS });

    return new Response(JSON.stringify({ ean: data }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
};

export const config = { path: "/api/ean-assign" };
