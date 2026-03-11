import { createClient } from "@supabase/supabase-js";

export const config = { path: "/api/test-api-key" };

export default async function handler(req) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  try {
    const SUPABASE_URL = Netlify.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });

    const { provider, key } = await req.json();
    if (!key) return new Response(JSON.stringify({ ok: false, error: "Geen API key opgegeven" }), { status: 400, headers });

    if (provider === "gemini") {
      // Test with a minimal Gemini request
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Say OK" }] }] }),
        }
      );
      if (res.ok) {
        return new Response(JSON.stringify({ ok: true, message: "Gemini verbinding succesvol" }), { headers });
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        return new Response(JSON.stringify({ ok: false, error: msg }), { headers });
      }
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        return new Response(JSON.stringify({ ok: true, message: "OpenAI verbinding succesvol" }), { headers });
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        return new Response(JSON.stringify({ ok: false, error: msg }), { headers });
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "Onbekende provider" }), { status: 400, headers });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers });
  }
}
