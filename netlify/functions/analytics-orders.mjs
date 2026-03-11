import { createClient } from "@supabase/supabase-js";


function writeLog(supabase, level, message, meta = {}) {
  try { supabase.from("system_logs").insert({
    level, message, function_name: "analytics-orders",
    metadata: meta, created_at: new Date().toISOString(),
  }); } catch {} 
}

function parseSource(meta) {
  const get = (key) => meta.find(m => m.key === key)?.value || "";
  const sourceType = get("_wc_order_attribution_source_type");
  const utmSource  = get("_wc_order_attribution_utm_source");
  const referrer   = get("_wc_order_attribution_referrer");
  const campaign   = get("_wc_order_attribution_utm_campaign");
  const term       = get("_wc_order_attribution_utm_term");
  const medium     = get("_wc_order_attribution_utm_medium");
  const sessionPages = parseInt(get("_wc_order_attribution_session_pages")) || 1;
  const sessionCount = parseInt(get("_wc_order_attribution_session_count")) || 1;

  // Normalise source type → readable label
  let sourceLabel = "Direct";
  let sourceGroup = "direct";
  let sourceDomain = "";

  if (sourceType === "organic" || medium === "organic") {
    const engine = utmSource || (referrer ? new URL(referrer).hostname.replace("www.", "") : "");
    sourceLabel = engine ? `Organisch: ${capitalise(engine)}` : "Organisch";
    sourceGroup = "organic";
    sourceDomain = engine;
  } else if (sourceType === "referral" || medium === "referral") {
    const domain = referrer ? tryHostname(referrer) : utmSource || "";
    sourceLabel = domain ? `Doorverwijzing: ${domain}` : "Doorverwijzing";
    sourceGroup = isAiEngine(domain) ? "ai" : "referral";
    sourceDomain = domain;
  } else if (sourceType === "utm" || medium === "cpc" || medium === "paid") {
    sourceLabel = utmSource ? `Bron: ${capitalise(utmSource)}` : "Betaald";
    sourceGroup = "paid";
    sourceDomain = utmSource || "";
  } else if (sourceType === "email" || medium === "email") {
    sourceLabel = "E-mail";
    sourceGroup = "email";
  } else if (utmSource) {
    sourceLabel = `Bron: ${capitalise(utmSource)}`;
    sourceGroup = isAiEngine(utmSource) ? "ai" : "other";
    sourceDomain = utmSource;
  }

  return { sourceLabel, sourceGroup, sourceDomain, campaign, term, sessionPages, sessionCount };
}

function isAiEngine(domain) {
  const ai = ["perplexity", "chatgpt", "openai", "claude", "gemini", "bard", "copilot", "you.com", "phind"];
  return ai.some(a => (domain || "").toLowerCase().includes(a));
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function tryHostname(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url; }
}

function dateRange(range) {
  const now = new Date();
  const from = new Date();
  if (range === "7d")   from.setDate(now.getDate() - 7);
  if (range === "30d")  from.setDate(now.getDate() - 30);
  if (range === "90d")  from.setDate(now.getDate() - 90);
  if (range === "year") from.setFullYear(now.getFullYear(), 0, 1);
  return {
    after:  from.toISOString().split("T")[0],
    before: now.toISOString().split("T")[0],
  };
}

async function wooFetch(shop, endpoint, params = {}) {
  const base = shop.url.replace(/\/$/, "");
  const qs = new URLSearchParams({ per_page: "100", ...params }).toString();
  const url = `${base}/wp-json/wc/v3/${endpoint}?${qs}`;
  const auth = btoa(`${shop.consumer_key}:${shop.consumer_secret}`);
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllOrders(shop, after, before) {
  let page = 1, allOrders = [];
  while (true) {
    const batch = await wooFetch(shop, "orders", {
      after, before, status: "completed,processing,on-hold,cancelled,refunded",
      per_page: "100", page: String(page), _fields: "id,status,total,date_created,line_items,meta_data",
    });
    if (!batch.length) break;
    allOrders = allOrders.concat(batch);
    if (batch.length < 100) break;
    page++;
    if (page > 20) break; // safety cap: 2000 orders max
  }
  return allOrders;
}

function aggregateOrders(orders, shopId, shopName) {
  const byDate = {}, bySource = {}, byProduct = {}, byCampaign = {}, byHour = {};
  let totalRevenue = 0, totalOrders = 0, totalRefunds = 0;

  for (const order of orders) {
    const revenue = parseFloat(order.total) || 0;
    const date = order.date_created.split("T")[0];
    const hour = parseInt(order.date_created.split("T")[1]?.split(":")[0] || "0");
    const src = parseSource(order.meta_data || []);
    const isRefund = order.status === "refunded";
    if (isRefund) totalRefunds++;
    totalRevenue += revenue;
    totalOrders++;

    // By date
    if (!byDate[date]) byDate[date] = { date, revenue: 0, orders: 0 };
    byDate[date].revenue += revenue;
    byDate[date].orders++;

    // By source
    const sk = src.sourceLabel;
    if (!bySource[sk]) bySource[sk] = { label: sk, group: src.sourceGroup, domain: src.sourceDomain, revenue: 0, orders: 0, products: {} };
    bySource[sk].revenue += revenue;
    bySource[sk].orders++;

    // By hour
    if (!byHour[hour]) byHour[hour] = { hour, revenue: 0, orders: 0 };
    byHour[hour].revenue += revenue;
    byHour[hour].orders++;

    // Products per source
    for (const item of order.line_items || []) {
      const pname = item.name;
      const prev = bySource[sk].products[pname] || { revenue: 0, orders: 0 };
      bySource[sk].products[pname] = { revenue: prev.revenue + parseFloat(item.subtotal || 0), orders: prev.orders + item.quantity };

      if (!byProduct[pname]) byProduct[pname] = { name: pname, revenue: 0, orders: 0, sources: {} };
      byProduct[pname].revenue += parseFloat(item.subtotal || 0);
      byProduct[pname].orders += item.quantity;
      byProduct[pname].sources[src.sourceGroup] = (byProduct[pname].sources[src.sourceGroup] || 0) + 1;
    }

    // By campaign (paid only)
    if (src.campaign) {
      if (!byCampaign[src.campaign]) byCampaign[src.campaign] = { campaign: src.campaign, source: src.sourceDomain, term: src.term, revenue: 0, orders: 0 };
      byCampaign[src.campaign].revenue += revenue;
      byCampaign[src.campaign].orders++;
    }
  }

  return {
    shopId, shopName,
    summary: { totalRevenue, totalOrders, totalRefunds, avgOrderValue: totalOrders ? totalRevenue / totalOrders : 0 },
    byDate:     Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
    bySource:   Object.values(bySource).sort((a, b) => b.revenue - a.revenue),
    byProduct:  Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    byCampaign: Object.values(byCampaign).sort((a, b) => b.revenue - a.revenue),
    byHour:     Object.values(byHour).sort((a, b) => a.hour - b.hour),
  };
}

function mergeShopData(shopResults) {
  const merged = {
    shopId: "all", shopName: "Alle shops",
    summary: { totalRevenue: 0, totalOrders: 0, totalRefunds: 0, avgOrderValue: 0 },
    byDate: {}, bySource: {}, byProduct: {}, byCampaign: {}, byHour: {},
  };

  for (const r of shopResults) {
    merged.summary.totalRevenue  += r.summary.totalRevenue;
    merged.summary.totalOrders   += r.summary.totalOrders;
    merged.summary.totalRefunds  += r.summary.totalRefunds;

    for (const d of r.byDate) {
      merged.byDate[d.date] = merged.byDate[d.date]
        ? { ...merged.byDate[d.date], revenue: merged.byDate[d.date].revenue + d.revenue, orders: merged.byDate[d.date].orders + d.orders }
        : { ...d };
    }
    for (const s of r.bySource) {
      const existing = merged.bySource[s.label];
      merged.bySource[s.label] = existing
        ? { ...existing, revenue: existing.revenue + s.revenue, orders: existing.orders + s.orders }
        : { ...s };
    }
    for (const p of r.byProduct) {
      const existing = merged.byProduct[p.name];
      merged.byProduct[p.name] = existing
        ? { ...existing, revenue: existing.revenue + p.revenue, orders: existing.orders + p.orders }
        : { ...p };
    }
    for (const c of r.byCampaign) {
      const existing = merged.byCampaign[c.campaign];
      merged.byCampaign[c.campaign] = existing
        ? { ...existing, revenue: existing.revenue + c.revenue, orders: existing.orders + c.orders }
        : { ...c };
    }
    for (const h of r.byHour) {
      const existing = merged.byHour[h.hour];
      merged.byHour[h.hour] = existing
        ? { ...existing, revenue: existing.revenue + h.revenue, orders: existing.orders + h.orders }
        : { ...h };
    }
  }

  merged.summary.avgOrderValue = merged.summary.totalOrders
    ? merged.summary.totalRevenue / merged.summary.totalOrders : 0;
  merged.byDate     = Object.values(merged.byDate).sort((a, b) => a.date.localeCompare(b.date));
  merged.bySource   = Object.values(merged.bySource).sort((a, b) => b.revenue - a.revenue);
  merged.byProduct  = Object.values(merged.byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
  merged.byCampaign = Object.values(merged.byCampaign).sort((a, b) => b.revenue - a.revenue);
  merged.byHour     = Object.values(merged.byHour).sort((a, b) => a.hour - b.hour);

  return merged;
}

export default async function handler(req) {
  const SUPABASE_URL = Netlify.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SUPERADMIN_EMAIL = "leadingvation@gmail.com";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

    const url = new URL(req.url);
    const range    = url.searchParams.get("range") || "30d";
    const shopId   = url.searchParams.get("shop_id"); // null = all shops
    const { after, before } = dateRange(range);

    // Fetch shops for this user
    let shopsQuery = supabase.from("shops").select("id, name, url, consumer_key, consumer_secret").eq("user_id", user.id);
    if (shopId) shopsQuery = shopsQuery.eq("id", shopId);
    const { data: shops, error: shopsErr } = await shopsQuery;
    if (shopsErr) throw shopsErr;
    if (!shops?.length) return new Response(JSON.stringify({ error: "Geen shops gevonden" }), { status: 404, headers });

    // Fetch + aggregate per shop
    const shopResults = await Promise.allSettled(
      shops.map(async (shop) => {
        const orders = await fetchAllOrders(shop, after, before);
        return aggregateOrders(orders, shop.id, shop.name);
      })
    );

    const fulfilled = shopResults
      .filter(r => r.status === "fulfilled")
      .map(r => r.value);

    const failed = shopResults
      .filter(r => r.status === "rejected")
      .map((r, i) => ({ shop: shops[i]?.name, error: r.reason?.message }));

    if (!fulfilled.length) return new Response(JSON.stringify({ error: "Kon geen data ophalen", failed }), { status: 500, headers });

    const merged = fulfilled.length === 1 ? fulfilled[0] : mergeShopData(fulfilled);

    await writeLog(supabase, "info", `Analytics fetched: ${fulfilled.length} shops, range=${range}`, { userId: user.id });

    return new Response(JSON.stringify({ shops: fulfilled, merged, failed, range, after, before }), { headers });

  } catch (err) {
    await writeLog(supabase, "error", "analytics-orders failed", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
