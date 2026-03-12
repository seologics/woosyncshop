import { createClient } from '@supabase/supabase-js'

export const config = { path: '/api/duplicate-images', timeout: 26 }

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  try {
    const { shopId, images, titleSlug, newTitle } = await req.json()
    // images: [{ src, alt, isFeatured }]
    if (!shopId || !images?.length || !titleSlug) {
      return new Response(JSON.stringify({ error: 'shopId, images, titleSlug required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: shop } = await supabase.from('shops').select('site_url, consumer_key, consumer_secret').eq('id', shopId).eq('user_id', user.id).single()
    if (!shop) return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    const base = shop.site_url.replace(/\/$/, '')
    const authB64 = Buffer.from(`${shop.consumer_key}:${shop.consumer_secret}`).toString('base64')
    const wpAuth  = `Basic ${authB64}`

    // For featured image: generate AI alt text
    let featuredAlt = newTitle
    const anthropicKey = Netlify.env.get('ANTHROPIC_API_KEY')
    if (anthropicKey) {
      try {
        const { data: settings } = await supabase.from('platform_settings').select('claude_model_content').eq('id', 1).single()
        const model = settings?.claude_model_content || 'claude-sonnet-4-6'
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model, max_tokens: 100,
            messages: [{ role: 'user', content: `Write a concise, SEO-optimised image alt text (max 10 words) for a product image of: "${newTitle}". Return only the alt text, no quotes.` }],
          }),
        })
        const aiData = await aiRes.json()
        const txt = aiData.content?.[0]?.text?.trim()
        if (txt) featuredAlt = txt
      } catch {} // fall back to newTitle
    }

    const results = []

    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      const isFeatured = i === 0

      try {
        // 1. Download the source image
        const srcRes = await fetch(img.src)
        if (!srcRes.ok) throw new Error(`Failed to fetch image: ${srcRes.status}`)
        const contentType = srcRes.headers.get('content-type') || 'image/jpeg'
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpg'

        // 2. Build new filename with timestamp to avoid WP duplicate suffix (-1, -2)
        const ts = Date.now()
        const filename = i === 0 ? `${titleSlug}-${ts}.${ext}` : `${titleSlug}-${i + 1}-${ts}.${ext}`

        const imageBuffer = await srcRes.arrayBuffer()

        // 3. Upload to WordPress media endpoint
        const uploadRes = await fetch(`${base}/wp-json/wp/v2/media`, {
          method: 'POST',
          headers: {
            'Authorization': wpAuth,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Type': contentType,
          },
          body: imageBuffer,
        })

        if (!uploadRes.ok) {
          const errText = await uploadRes.text()
          throw new Error(`Media upload failed (${uploadRes.status}): ${errText.slice(0, 200)}`)
        }

        const media = await uploadRes.json()

        // 4. Set alt text via PATCH (wp/v2/media supports alt_text)
        const alt = isFeatured ? featuredAlt : (img.alt || newTitle)
        await fetch(`${base}/wp-json/wp/v2/media/${media.id}`, {
          method: 'POST',
          headers: { 'Authorization': wpAuth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ alt_text: alt, title: isFeatured ? newTitle : (img.alt || newTitle) }),
        })

        results.push({ id: media.id, src: media.source_url, alt })
      } catch (e) {
        // If upload fails, fall back to passing src URL (WooCommerce will sideload)
        results.push({ src: img.src, alt: isFeatured ? featuredAlt : (img.alt || ''), fallback: true, error: e.message })
      }
    }

    return new Response(JSON.stringify({ images: results, featuredAlt }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
