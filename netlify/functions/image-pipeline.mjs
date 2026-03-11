import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'image-pipeline', message, metadata: meta }) } catch {}
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  // Verify plan
  const { data: profile } = await supabase.from('user_profiles').select('plan').eq('id', user.id).single()
  if (profile?.plan !== 'pro' && profile?.plan !== 'free_forever' && user.email !== SUPERADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Pro plan required' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { base64, filename, shop_id, media_type = 'image/jpeg' } = await req.json()
    if (!base64 || !shop_id) return new Response(JSON.stringify({ error: 'base64 and shop_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // Get API keys from platform settings
    const { data: settings } = await supabase.from('platform_settings').select('tinypng_api_key, gemini_api_key').eq('id', 1).single()
    const tinypngKey = settings?.tinypng_api_key
    const geminiKey = settings?.gemini_api_key

    let processedBase64 = base64
    let processedMimeType = media_type
    const originalSize = Math.round(base64.length * 0.75 / 1024) // approx KB

    // ── Step 1: Gemini resize/optimize (if key available and image > 400KB) ─
    const MAX_KB = 400;
    const originalKb = Math.round(base64.length * 0.75 / 1024);

    if (geminiKey && originalKb > MAX_KB) {
      try {
        const sizeHint = originalKb > 2000 ? 1024 : originalKb > 800 ? 800 : 600;
        const prompt = `Resize and optimize this product image to fit within ${sizeHint}px on the longest side. 
Preserve all product details, colors, and sharpness. Output as a clean JPEG suitable for e-commerce.
Return ONLY the image data, nothing else.`

        const geminiImageRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: media_type, data: processedBase64 } }
                ]
              }],
              generationConfig: { response_mime_type: 'image/jpeg' }
            }),
          }
        )

        if (geminiImageRes.ok) {
          const geminiResult = await geminiImageRes.json()
          const imgPart = geminiResult.candidates?.[0]?.content?.parts?.find(p => p.inline_data?.data)
          if (imgPart?.inline_data?.data) {
            processedBase64 = imgPart.inline_data.data
            processedMimeType = imgPart.inline_data.mime_type || 'image/jpeg'
            const resizedKb = Math.round(processedBase64.length * 0.75 / 1024)
            await log(supabase, 'info', `Gemini resized ${filename}: ${originalKb}KB → ${resizedKb}KB`, {
              user_id: user.id, shop_id
            })
          }
        }
      } catch (e) {
        await log(supabase, 'warn', `Gemini resize failed for ${filename}, continuing`, { error: e.message })
        // Non-fatal — continue with original
      }
    }

    // ── Step 2: TinyPNG compression (if key available) ──────────────────────
    if (tinypngKey) {
      try {
        const imgBuffer = Buffer.from(base64, 'base64')
        // Upload to TinyPNG
        const tinifyRes = await fetch('https://api.tinify.com/shrink', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`api:${tinypngKey}`).toString('base64')}`,
            'Content-Type': media_type,
          },
          body: imgBuffer,
        })
        if (tinifyRes.ok) {
          const tinifyData = await tinifyRes.json()
          const compressedUrl = tinifyData.output?.url
          if (compressedUrl) {
            const compressedRes = await fetch(compressedUrl, {
              headers: { 'Authorization': `Basic ${Buffer.from(`api:${tinypngKey}`).toString('base64')}` }
            })
            if (compressedRes.ok) {
              const compressedBuffer = await compressedRes.arrayBuffer()
              processedBase64 = Buffer.from(compressedBuffer).toString('base64')
              const newSize = Math.round(compressedBuffer.byteLength / 1024)
              await log(supabase, 'info', `TinyPNG compressed ${filename}`, {
                user_id: user.id, shop_id, original_kb: originalSize, compressed_kb: newSize
              })
            }
          }
        }
      } catch (e) {
        await log(supabase, 'warn', `TinyPNG failed for ${filename}, using original`, { error: e.message })
        // Continue with original — TinyPNG failure is non-fatal
      }
    }

    // ── Step 3: Upload to WooCommerce via WordPress media API ───────────────
    const { data: shop } = await supabase
      .from('shops')
      .select('site_url, consumer_key, consumer_secret')
      .eq('id', shop_id)
      .eq('user_id', user.id)
      .single()

    if (!shop) return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    const baseUrl = shop.site_url.replace(/\/$/, '')
    const credentials = Buffer.from(`${shop.consumer_key}:${shop.consumer_secret}`).toString('base64')
    const imgBuffer = Buffer.from(processedBase64, 'base64')
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()

    const mediaRes = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Type': media_type,
      },
      body: imgBuffer,
    })

    if (!mediaRes.ok) {
      const errText = await mediaRes.text()
      await log(supabase, 'error', `WP media upload failed for ${filename}`, { shop_id, status: mediaRes.status, error: errText.slice(0, 200) })
      return new Response(JSON.stringify({ error: `Media upload failed: HTTP ${mediaRes.status}`, detail: errText.slice(0, 200) }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }

    const media = await mediaRes.json()
    const finalSizeKb = Math.round(imgBuffer.byteLength / 1024)

    await log(supabase, 'info', `Image uploaded to WooCommerce: ${filename}`, {
      user_id: user.id, shop_id, media_id: media.id, url: media.source_url,
      original_kb: originalSize, final_kb: finalSizeKb,
      tinypng_used: !!tinypngKey,
    })

    return new Response(JSON.stringify({
      ok: true,
      url: media.source_url,
      src: media.source_url,
      id: media.id,
      width: media.media_details?.width,
      height: media.media_details?.height,
      final_kb: finalSizeKb,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    await log(supabase, 'error', 'image-pipeline unhandled error', { error: err.message })
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/image-pipeline' }
