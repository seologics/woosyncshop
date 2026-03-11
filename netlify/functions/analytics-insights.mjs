import { createClient } from "@supabase/supabase-js";

function writeLog(supabase, level, message, meta = {}) {
  try { supabase.from("system_logs").insert({
    level, message, function_name: "analytics-insights",
    metadata: meta, created_at: new Date().toISOString(),
  }); } catch {}
}

function buildPrompt(data) {
  const { merged, shops, range, previousMerged } = data;
  const rangeLabel = { "7d": "7 dagen", "30d": "30 dagen", "90d": "90 dagen", "year": "dit jaar" }[range] || range;

  const topSources = merged.bySource.slice(0, 8).map(s =>
    `  - ${s.label}: €${s.revenue.toFixed(2)} omzet, ${s.orders} orders`
  ).join("\n");

  const topProducts = merged.byProduct.slice(0, 6).map(p =>
    `  - ${p.name}: €${p.revenue.toFixed(2)} omzet, ${p.orders} orders`
  ).join("\n");

  const topCampaigns = merged.byCampaign.slice(0, 5).map(c =>
    `  - "${c.campaign}" (${c.source}): €${c.revenue.toFixed(2)} omzet, ${c.orders} orders`
  ).join("\n") || "  Geen campagnedata beschikbaar";

  const peakHour = merged.byHour.reduce((a, b) => b.orders > a.orders ? b : a, { hour: 0, orders: 0 });
  const slowHour = merged.byHour.filter(h => h.orders > 0).reduce((a, b) => b.orders < a.orders ? b : a, { hour: 0, orders: 999 });

  const aiSources = merged.bySource.filter(s => s.group === "ai");
  const aiRevenue = aiSources.reduce((s, x) => s + x.revenue, 0);
  const organicRevenue = merged.bySource.filter(s => s.group === "organic").reduce((s, x) => s + x.revenue, 0);
  const paidRevenue = merged.bySource.filter(s => s.group === "paid").reduce((s, x) => s + x.revenue, 0);
  const directRevenue = merged.bySource.filter(s => s.group === "direct").reduce((s, x) => s + x.revenue, 0);

  const growthNote = previousMerged
    ? `Vorige periode: €${previousMerged.summary.totalRevenue.toFixed(2)} omzet, ${previousMerged.summary.totalOrders} orders.`
    : "Vergelijkingsdata vorige periode niet beschikbaar.";

  const shopSummary = shops.map(s =>
    `  - ${s.shopName}: €${s.summary.totalRevenue.toFixed(2)}, ${s.summary.totalOrders} orders, gem. €${s.summary.avgOrderValue.toFixed(2)}`
  ).join("\n");

  return `Je bent een e-commerce analyticus voor een WooCommerce multi-shop platform genaamd WooSyncShop.
Analyseer de onderstaande verkoopdata van de afgelopen ${rangeLabel} en geef EXACT 5 inzichten terug.

VERKOOPDATA:
Totale omzet: €${merged.summary.totalRevenue.toFixed(2)}
Totaal orders: ${merged.summary.totalOrders}
Gemiddelde orderwaarde: €${merged.summary.avgOrderValue.toFixed(2)}
Terugboekingen: ${merged.summary.totalRefunds}
${growthNote}

Per shop:
${shopSummary}

Omzet per kanaal:
  - Organisch: €${organicRevenue.toFixed(2)}
  - Betaald: €${paidRevenue.toFixed(2)}
  - Direct: €${directRevenue.toFixed(2)}
  - AI zoekmachines: €${aiRevenue.toFixed(2)}

Top bronnen:
${topSources}

Top producten:
${topProducts}

Google Ads campagnes:
${topCampaigns}

Piekuur (meeste orders): ${peakHour.hour}:00 uur (${peakHour.orders} orders)
Laagste uur: ${slowHour.hour}:00 uur

INSTRUCTIES:
Geef precies 5 actionable inzichten terug als JSON array. Elk inzicht heeft:
- "type": een van "opportunity" | "warning" | "win" | "action"
- "title": max 8 woorden, pakkend en specifiek
- "insight": 2-3 zinnen met concrete observatie en context
- "action": 1 concrete aanbevolen actie met geschatte impact indien mogelijk
- "priority": 1 (hoogst) t/m 5 (laagst)
- "icon": één relevant emoji

Focus op: kanaalverdeling, productprestaties, campagne-efficiëntie, timing, AI-zoektrends, quick wins.
Wees specifiek met getallen. Vermijd algemeenheden.
Antwoord ALLEEN met de JSON array, geen tekst eromheen.`;
}

export default async function handler(req) {
  const supabase = createClient(Netlify.env.get("SUPABASE_URL"), Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

    // Get Gemini key from platform_settings
    const { data: settings } = await supabase.from("platform_settings").select("gemini_api_key, gemini_model").eq("id", 1).single();
    const geminiKey = settings?.gemini_api_key;
    if (!geminiKey) return new Response(JSON.stringify({ error: "Gemini API key niet geconfigureerd" }), { status: 400, headers });

    // Get user's own Gemini model preference
    const { data: profile } = await supabase.from("user_profiles").select("gemini_model, plan").eq("id", user.id).single();
    const model = profile?.gemini_model || settings?.gemini_model || "gemini-2.0-flash";

    const body = await req.json();
    const prompt = buildPrompt(body);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error: ${geminiRes.status} ${errText}`);
    }

    const geminiData = await geminiRes.json();
    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    // Strip markdown fences if present
    rawText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let insights;
    try {
      insights = JSON.parse(rawText);
    } catch {
      throw new Error("Gemini returned invalid JSON: " + rawText.slice(0, 200));
    }

    // Sort by priority
    insights.sort((a, b) => (a.priority || 5) - (b.priority || 5));

    await writeLog(supabase, "info", `AI insights generated for user ${user.id}`, { model, insightCount: insights.length });

    return new Response(JSON.stringify({ insights }), { headers });

  } catch (err) {
    writeLog(supabase, "error", "analytics-insights failed", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
