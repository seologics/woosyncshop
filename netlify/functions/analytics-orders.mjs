import { createClient } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeLog(supabase, level, message, meta = {}) {
  return supabase.from("system_logs").insert({
    level, message, function_name: "analytics-orders",
    metadata: meta, created_at: new Date().toISOString(),
  }).catch(() => {});
}

function parseSource(meta) {
  const get = (key) => (meta || []).find(m => m.key === key)?.value || "";
  const sourceType = get("_wc_order_attribution_source_type");
  const utmSource  = get("_wc_order_attribution_utm_source");
  const referrer   = get("_wc_order_attribution_referrer");
  const campaign   = get("_wc_order_attribution_utm_campaign");
  const term       = get("_wc_order_attribution_utm_term");
  const medium     = get("_wc_order_attribution_utm_medium");

  let sourceLabel = "Direct";
  let sourceGroup = "direct";
  let sourceDomain = "";

  // Admin/back-office orders
  if (sourceType === "admin" || sourceType === "typein" || (!sourceType && !utmSource && !referrer && !medium)) {
    if (!utmSource && !referrer && !medium && !sourceType) {
      sourceLabel = "Direct";
      sourceGroup = "direct";
    } else {
      sourceLabel = "Intern / Admin";
      sourceGroup = "admin";
    }
  } else if (sourceType === "organic" || medium === "organic") {
    const engine = utmSource || (referrer ? tryHostname(referrer) : "");
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

  return { sourceLabel, sourceGroup, sourceDomain, campaign, term };
}

function isAiEngine(domain) {
  const ai = ["perplexity", "chatgpt", "openai", "claude", "gemini", "bard", "copilot", "you.com", "phind"];
  return ai.some(a => (domain || "").toLowerCase().includes(a));
}

function capitalise(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function tryHostname(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function dateRange(range) {
  const now = new Date();
  const from = new Date();
  if (range === "7d")   from.setDate(now.getDate() - 7);
  if (range === "30d")  from.setDate(now.getDate() - 30);
  if (range === "90d")  from.setDate(now.getDate() - 90);
  if (range === "year") from.setFullYear(now.getFullYear(), 0, 1);
  const pad = (d) => d.toISOString().split("T")[0];
  return {
    after:  `${pad(from)}T00:00:00`,
    before: `${pad(now)}T23:59:59`,
  };
}

async function wooFetch(shop, endpoint, params = {}) {
  const base = (shop.site_url || shop.url || "").replace(/\/$/, "");
  const qs = new URLSearchParams({ per_page: "100", ...params }).toString();
  const url = `${base}/wp-json/wc/v3/${endpoint}?${qs}`;
  const auth = btoa(`${shop.consumer_key}:${shop.consumer_secret}`);
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WooCommerce ${res.status} on ${endpoint}: ${await res.text()}`);
  return res.json();
}

// Statuses considered "paid" (revenue-generating)
const PAID_STATUSES = new Set(["completed", "processing", "on-hold"]);
const CANCELLED_STATUSES = new Set(["cancelled", "failed", "pending"]);
const REFUNDED_STATUSES  = new Set(["refunded"]);

async function fetchAllOrders(shop, after, before) {
  let page = 1, allOrders = [];
  while (true) {
    const batch = await wooFetch(shop, "orders", {
      after, before,
      per_page: "100", page: String(page),
      _fields: "id,status,total,total_tax,discount_total,shipping_total,date_created,line_items,meta_data",
    });
    if (!Array.isArray(batch) || !batch.length) break;
    allOrders = allOrders.concat(batch);
    if (batch.length < 100) break;
    page++;
    if (page > 20) break;
  }
  return allOrders;
}

function aggregateOrders(orders, shopId, shopName, opts = {}) {
  const { excludeCancelled = false, excludeRefunded = false } = opts;
  const byDate = {}, bySource = {}, byProduct = {}, byCampaign = {}, byHour = {};
  let totalRevenue = 0, totalOrders = 0, totalRefunds = 0;
  let totalDiscount = 0, totalTax = 0, totalShipping = 0;

  for (const order of orders) {
    const status = order.status;
    if (excludeCancelled && CANCELLED_STATUSES.has(status)) continue;
    if (excludeRefunded  && REFUNDED_STATUSES.has(status))  continue;

    const isPaid     = PAID_STATUSES.has(status);
    const isRefunded = REFUNDED_STATUSES.has(status);
    const isCancelled = CANCELLED_STATUSES.has(status);

    // Only count revenue/tax/discount/shipping for paid orders
    const orderTax      = parseFloat(order.total_tax)      || 0;
    const orderShipping = parseFloat(order.shipping_total) || 0;
    const orderDiscount = parseFloat(order.discount_total) || 0;
    // Revenue = total paid - tax (excl. BTW)
    const orderTotal    = parseFloat(order.total)          || 0;
    const revenue       = isPaid ? Math.max(0, orderTotal - orderTax) : 0;

    if (isRefunded) totalRefunds++;
    if (isPaid) {
      totalRevenue  += revenue;
      totalTax      += orderTax;
      totalShipping += orderShipping;
      totalDiscount += orderDiscount;
      totalOrders++;
    }

    const date = order.date_created.split("T")[0];
    const hour = parseInt(order.date_created.split("T")[1]?.split(":")[0] || "0");
    const src  = parseSource(order.meta_data || []);

    // By date (paid only)
    if (isPaid) {
      if (!byDate[date]) byDate[date] = { date, revenue: 0, orders: 0 };
      byDate[date].revenue += revenue;
      byDate[date].orders++;
    }

    // By source (paid only)
    if (isPaid) {
      const sk = src.sourceLabel;
      if (!bySource[sk]) bySource[sk] = { label: sk, group: src.sourceGroup, domain: src.sourceDomain, revenue: 0, orders: 0, products: {} };
      bySource[sk].revenue += revenue;
      bySource[sk].orders++;

      // Products per source
      for (const item of (order.line_items || [])) {
        const pname = item.name;
        const itemRevenue = parseFloat(item.total || 0);  // post-discount price
        const prev = bySource[sk].products[pname] || { revenue: 0, orders: 0 };
        bySource[sk].products[pname] = { revenue: prev.revenue + itemRevenue, orders: prev.orders + item.quantity };

        if (!byProduct[pname]) byProduct[pname] = { name: pname, revenue: 0, orders: 0, sources: {} };
        byProduct[pname].revenue += itemRevenue;
        byProduct[pname].orders  += item.quantity;
        byProduct[pname].sources[src.sourceGroup] = (byProduct[pname].sources[src.sourceGroup] || 0) + 1;
      }
    }

    // By hour (paid only)
    if (isPaid) {
      if (!byHour[hour]) byHour[hour] = { hour, revenue: 0, orders: 0 };
      byHour[hour].revenue += revenue;
      byHour[hour].orders++;
    }

    // By campaign
    if (isPaid && src.campaign) {
      if (!byCampaign[src.campaign]) byCampaign[src.campaign] = { campaign: src.campaign, source: src.sourceDomain, term: src.term, revenue: 0, orders: 0 };
      byCampaign[src.campaign].revenue += revenue;
      byCampaign[src.campaign].orders++;
    }
  }

  return {
    shopId, shopName,
    summary: {
      totalRevenue, totalOrders, totalRefunds, totalDiscount, totalTax, totalShipping,
      avgOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
    },
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
    summary: { totalRevenue: 0, totalOrders: 0, totalRefunds: 0, totalDiscount: 0, totalTax: 0, totalShipping: 0, avgOrderValue: 0 },
    byDate: {}, bySource: {}, byProduct: {}, byCampaign: {}, byHour: {},
  };

  for (const r of shopResults) {
    merged.summary.totalRevenue  += r.summary.totalRevenue;
    merged.summary.totalOrders   += r.summary.totalOrders;
    merged.summary.totalRefunds  += r.summary.totalRefunds;
    merged.summary.totalDiscount += r.summary.totalDiscount || 0;
    merged.summary.totalTax      += r.summary.totalTax      || 0;
    merged.summary.totalShipping += r.summary.totalShipping || 0;

    for (const d of r.byDate) {
      const e = merged.byDate[d.date];
      merged.byDate[d.date] = e
        ? { ...e, revenue: e.revenue + d.revenue, orders: e.orders + d.orders }
        : { ...d };
    }
    for (const s of r.bySource) {
      const e = merged.bySource[s.label];
      merged.bySource[s.label] = e
        ? { ...e, revenue: e.revenue + s.revenue, orders: e.orders + s.orders }
        : { ...s };
    }
    for (const p of r.byProduct) {
      const e = merged.byProduct[p.name];
      merged.byProduct[p.name] = e
        ? { ...e, revenue: e.revenue + p.revenue, orders: e.orders + p.orders }
        : { ...p };
    }
    for (const c of r.byCampaign) {
      const e = merged.byCampaign[c.campaign];
      merged.byCampaign[c.campaign] = e
        ? { ...e, revenue: e.revenue + c.revenue, orders: e.orders + c.orders }
        : { ...c };
    }
    for (const h of r.byHour) {
      const e = merged.byHour[h.hour];
      merged.byHour[h.hour] = e
        ? { ...e, revenue: e.revenue + h.revenue, orders: e.orders + h.orders }
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

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  // ⚠️ Netlify.env.get() MUST be called inside handler, never at module level
  const supabase = createClient(
    Netlify.env.get("SUPABASE_URL"),
    Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );

  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

    const url   = new URL(req.url);
    const range  = url.searchParams.get("range") || "30d";
    const shopId = url.searchParams.get("shop_id");
    const excludeCancelled = url.searchParams.get("exclude_cancelled") === "1";
    const excludeRefunded  = url.searchParams.get("exclude_refunded")  === "1";
    const { after, before } = dateRange(range);

    let shopsQuery = supabase.from("shops").select("id, name, site_url, consumer_key, consumer_secret").eq("user_id", user.id);
    if (shopId) shopsQuery = shopsQuery.eq("id", shopId);
    const { data: shops, error: shopsErr } = await shopsQuery;
    if (shopsErr) throw shopsErr;
    if (!shops?.length) return new Response(JSON.stringify({ error: "Geen shops gevonden" }), { status: 404, headers });

    const shopResults = await Promise.allSettled(
      shops.map(async (shop) => {
        const orders = await fetchAllOrders(shop, after, before);
        return aggregateOrders(orders, shop.id, shop.name, { excludeCancelled, excludeRefunded });
      })
    );

    const fulfilled = shopResults.filter(r => r.status === "fulfilled").map(r => r.value);
    const failed    = shopResults.filter(r => r.status === "rejected").map((r, i) => ({ shop: shops[i]?.name, error: r.reason?.message }));

    if (!fulfilled.length) return new Response(JSON.stringify({ error: "Kon geen data ophalen", failed }), { status: 500, headers });

    const merged = fulfilled.length === 1 ? fulfilled[0] : mergeShopData(fulfilled);

    await writeLog(supabase, "info", `Analytics fetched: ${fulfilled.length} shops, range=${range}`, { userId: user.id });

    return new Response(JSON.stringify({ shops: fulfilled, merged, failed, range, after, before }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

export const config = { path: "/api/analytics-orders" };
