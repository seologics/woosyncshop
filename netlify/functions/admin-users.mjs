import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const SUPERADMIN_EMAIL = 'leadingvation@gmail.com'

export default async (req) => {
  if (!['GET', 'PUT', 'PATCH', 'DELETE', 'POST'].includes(req.method)) {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user || user.email !== SUPERADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  // PATCH: archive / unarchive
  if (req.method === 'PATCH') {
    try {
      const { id, archived } = await req.json()
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      const updates = { archived: archived !== false, archived_at: archived !== false ? new Date().toISOString() : null }
      if (archived !== false) updates.plan = 'suspended'
      const { error } = await supabase.from('user_profiles').update(updates).eq('id', id)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      await supabase.from('system_logs').insert({ level: 'warn', function_name: 'admin-users', message: `User ${id} ${archived !== false ? 'archived' : 'unarchived'}`, metadata: { user_id: id } })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }) }
  }

  // DELETE: permanent delete
  if (req.method === 'DELETE') {
    try {
      const { id } = await req.json()
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      await supabase.from('user_profiles').delete().eq('id', id)
      const { error: authDelErr } = await supabase.auth.admin.deleteUser(id)
      if (authDelErr) return new Response(JSON.stringify({ error: authDelErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      await supabase.from('system_logs').insert({ level: 'warn', function_name: 'admin-users', message: `User ${id} permanently deleted`, metadata: { user_id: id } })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }) }
  }

  // PUT: update profile
  if (req.method === 'PUT') {
    try {
      const body = await req.json()
      const { id, ...updates } = body
      if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

      // Fetch current profile to detect plan changes for history logging
      const { data: prevProfile } = await supabase.from('user_profiles').select('plan, billing_period').eq('id', id).single()

      const allowed = {
        plan: updates.plan,
        billing_period: updates.billing_period || undefined,
        max_shops: updates.max_shops != null ? parseInt(updates.max_shops) : undefined,
        max_connected_products: updates.max_connected_products != null ? parseInt(updates.max_connected_products) : undefined,
        is_admin: updates.is_admin ?? undefined,
        ai_taxonomy_enabled: updates.ai_taxonomy_enabled ?? undefined,
        ai_taxonomy_model: updates.ai_taxonomy_model || undefined,
        ai_taxonomy_threshold: updates.ai_taxonomy_threshold != null ? parseFloat(updates.ai_taxonomy_threshold) : undefined,
        gemini_model: updates.gemini_model || undefined,
        img_max_kb: updates.img_max_kb != null ? parseInt(updates.img_max_kb) : undefined,
        img_quality: updates.img_quality != null ? parseInt(updates.img_quality) : undefined,
        img_max_width: updates.img_max_width != null ? parseInt(updates.img_max_width) : undefined,
      }
      Object.keys(allowed).forEach(k => allowed[k] === undefined && delete allowed[k])
      const { error } = await supabase.from('user_profiles').update(allowed).eq('id', id)
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

      // Log plan change in history if plan was changed
      if (updates.plan && prevProfile?.plan !== updates.plan) {
        const planOrder = { starter: 1, growth: 2, pro: 3, free_forever: 0, pending_payment: 0, suspended: 0 }
        const fromOrder = planOrder[prevProfile?.plan] || 0
        const toOrder = planOrder[updates.plan] || 0
        let eventType = 'admin_change'
        if (toOrder > fromOrder) eventType = 'upgraded'
        else if (toOrder < fromOrder && toOrder > 0) eventType = 'downgraded'

        try {
          await supabase.from('user_plan_history').insert({
            user_id: id,
            event_type: eventType,
            from_plan: prevProfile?.plan || null,
            to_plan: updates.plan,
            billing_period: updates.billing_period || prevProfile?.billing_period || 'monthly',
            notes: `Handmatig gewijzigd door superadmin (${prevProfile?.plan || '?'} → ${updates.plan})`,
          })
        } catch {}

        await supabase.from('system_logs').insert({
          level: 'info', function_name: 'admin-users',
          message: `Admin changed plan for user ${id}: ${prevProfile?.plan} → ${updates.plan}`,
          metadata: { user_id: id, from_plan: prevProfile?.plan, to_plan: updates.plan },
        })
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }) }
  }

  // POST: create user from superadmin
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const { email, password, full_name, business_name, country, plan, billingPeriod, discountCode,
              max_shops, max_connected_products, gemini_model, img_max_kb, img_quality, img_max_width,
              ai_taxonomy_enabled } = body

      if (!email?.trim() || !password || password.length < 8) {
        return new Response(JSON.stringify({ error: 'E-mail en wachtwoord (min 8 tekens) zijn verplicht.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }

      const isFree = discountCode?.toLowerCase() === 'freeforever'
      const effectivePlan = isFree ? 'free_forever' : 'pending_payment'
      const chosenPlan = isFree ? null : (plan || 'growth')

      // Check if user already exists
      const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers()
      if (existingUsers?.some(u => u.email?.toLowerCase() === email.toLowerCase())) {
        return new Response(JSON.stringify({ error: 'Dit e-mailadres is al in gebruik.' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      }

      // Create auth user
      const { data: { user: newUser }, error: createErr } = await supabase.auth.admin.createUser({
        email, password,
        email_confirm: true,
        user_metadata: { full_name: full_name || '', country: country || 'NL', plan: chosenPlan || 'free_forever', billing_period: billingPeriod || 'monthly' },
      })
      if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })

      // Determine plan limits for defaults
      const PLAN_LIMITS = {
        starter:      { sites: 2,  connected_products: 500,   img_max_kb: 200,  img_quality: 75, img_max_width: 1000, gemini_model: 'gemini-2.0-flash-lite' },
        growth:       { sites: 5,  connected_products: 2000,  img_max_kb: 400,  img_quality: 85, img_max_width: 1600, gemini_model: 'gemini-2.0-flash' },
        pro:          { sites: 10, connected_products: 10000, img_max_kb: 600,  img_quality: 90, img_max_width: 2400, gemini_model: 'gemini-2.5-flash-image' },
        free_forever: { sites: 2,  connected_products: 500,   img_max_kb: 200,  img_quality: 75, img_max_width: 1000, gemini_model: 'gemini-2.0-flash-lite' },
      }
      const limits = PLAN_LIMITS[chosenPlan || 'free_forever'] || PLAN_LIMITS.growth

      // Create user_profile
      const profileRow = {
        id: newUser.id,
        full_name: full_name || '',
        business_name: business_name || null,
        country: country || 'NL',
        plan: effectivePlan,
        chosen_plan: chosenPlan,
        billing_period: billingPeriod || 'monthly',
        max_shops: max_shops ? parseInt(max_shops) : limits.sites,
        max_connected_products: max_connected_products ? parseInt(max_connected_products) : limits.connected_products,
        gemini_model: gemini_model || limits.gemini_model,
        img_max_kb: img_max_kb ? parseInt(img_max_kb) : limits.img_max_kb,
        img_quality: img_quality ? parseInt(img_quality) : limits.img_quality,
        img_max_width: img_max_width ? parseInt(img_max_width) : limits.img_max_width,
        ai_taxonomy_enabled: ai_taxonomy_enabled ?? false,
      }
      await supabase.from('user_profiles').upsert(profileRow)

      // Send email
      try {
        const firstName = (full_name || email).split(' ')[0]
        const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
        const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
        const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`
        const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })

        if (isFree) {
          // Welcome email (same template as register.mjs free_forever)
          await transporter.sendMail({
            from: '"WooSyncShop" <info@woosyncshop.com>',
            to: email,
            subject: 'Welkom bij WooSyncShop 🎁 — je gratis account is klaar',
            html: `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2d3056">
    <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#fff">WooSync<span style="color:#c4b5fd">Shop</span></div>
      <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:6px">Multi-shop WooCommerce beheer</div>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">Hoi ${firstName}, welkom! 👋</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">Je gratis WooSyncShop account is aangemaakt. Je kunt direct inloggen met je e-mailadres.</p>
      <div style="text-align:center;margin:28px 0 8px">
        <a href="https://woosyncshop.com" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">Inloggen →</a>
      </div>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#94a3b8">Je account heeft vaste limieten. Voor wijzigingen kun je contact opnemen via de <strong style="color:#e2e8f0">Help</strong> knop of de <strong style="color:#e2e8f0">contactpagina</strong>.</p>
    </td></tr>
    <tr><td style="padding:20px 40px;border-top:1px solid #2d3056;text-align:center">
      <p style="margin:0;font-size:12px;color:#4b5563">WooSyncShop · Webs Media · De Wittenkade 152H · 1051 AN Amsterdam<br>
      <a href="https://woosyncshop.com/contact" style="color:#6366f1;text-decoration:none">Contact</a></p>
    </td></tr>
  </table></td></tr></table>
</body></html>`,
          })
        } else {
          // Payment reminder email
          const planNames = { starter: 'Starter', growth: 'Growth', pro: 'Pro' }
          const planName = planNames[chosenPlan] || 'Growth'
          const billingLabel = billingPeriod === 'annual' ? 'jaarabonnement' : 'maandabonnement'
          const planPrices = { starter: { monthly: '7.99', annual_mo: '7.19' }, growth: { monthly: '11.99', annual_mo: '10.79' }, pro: { monthly: '19.99', annual_mo: '17.99' } }
          const price = planPrices[chosenPlan]?.[billingPeriod === 'annual' ? 'annual_mo' : 'monthly'] || '11.99'
          await transporter.sendMail({
            from: '"WooSyncShop" <info@woosyncshop.com>',
            to: email,
            subject: `Je WooSyncShop ${planName} account is klaar — voltooi je betaling`,
            html: `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'DM Sans',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2d3056">
    <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#fff">WooSync<span style="color:#c4b5fd">Shop</span></div>
      <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:6px">Multi-shop WooCommerce beheer</div>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">Hoi ${firstName}, je account staat klaar! 🎉</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#94a3b8">Je bent aangemeld voor <strong style="color:#c4b5fd">WooSyncShop ${planName}</strong> (${billingLabel} · €${price}/maand). Voltooi je betaling om toegang te krijgen.</p>
      <div style="background:#0f1117;border:1px solid #2d3056;border-radius:8px;padding:16px 20px;margin:0 0 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#94a3b8">Pakket</td><td style="font-size:13px;font-weight:700;color:#f1f5f9;text-align:right">WooSyncShop ${planName}</td></tr>
          <tr><td colspan="2" style="padding:4px 0"></td></tr>
          <tr><td style="font-size:13px;color:#94a3b8">Facturering</td><td style="font-size:13px;color:#e2e8f0;text-align:right">${billingLabel}</td></tr>
          <tr><td colspan="2" style="padding:4px 0"></td></tr>
          <tr><td style="font-size:13px;color:#94a3b8">Bedrag</td><td style="font-size:15px;font-weight:800;color:#c4b5fd;text-align:right">€${price} / maand</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:0 0 8px">
        <a href="https://woosyncshop.com/?pay=1" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px">Betaling afronden →</a>
      </div>
      <p style="margin:8px 0 0;font-size:11px;color:#4b5563;text-align:center">🔒 Veilige betaling via Mollie</p>
    </td></tr>
    <tr><td style="padding:20px 40px;border-top:1px solid #2d3056;text-align:center">
      <p style="margin:0;font-size:12px;color:#4b5563">WooSyncShop · Webs Media · De Wittenkade 152H · 1051 AN Amsterdam<br>
      <a href="https://woosyncshop.com/contact" style="color:#6366f1;text-decoration:none">Contact</a></p>
    </td></tr>
  </table></td></tr></table>
</body></html>`,
          })
        }
      } catch (mailErr) {
        await supabase.from('system_logs').insert({ level: 'warn', function_name: 'admin-users', message: `Email failed for created user ${email}: ${mailErr.message}`, metadata: { user_id: newUser.id } })
      }

      await supabase.from('system_logs').insert({ level: 'info', function_name: 'admin-users', message: `Superadmin created user: ${email} (plan: ${effectivePlan})`, metadata: { user_id: newUser.id, plan: effectivePlan } })

      // Return the new user row for the list
      const returnUser = {
        ...profileRow,
        email,
        sites: 0,
        status: effectivePlan === 'free_forever' ? 'active' : 'pending',
        name: full_name || '',
      }
      return new Response(JSON.stringify({ ok: true, user: returnUser }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // GET: list all users — or plan history for a single user
  try {
    const url = new URL(req.url, 'https://woosyncshop.com')
    const historyUserId = url.searchParams.get('history')

    // Plan history for a specific user
    if (historyUserId) {
      const { data: history, error: histErr } = await supabase
        .from('user_plan_history')
        .select('*')
        .eq('user_id', historyUserId)
        .order('created_at', { ascending: false })
      if (histErr) throw histErr
      return new Response(JSON.stringify({ history: history || [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: profiles, error: profileErr } = await supabase.from('user_profiles').select('*')
    if (profileErr) throw profileErr
    const { data: { users: authUsers }, error: authUsersErr } = await supabase.auth.admin.listUsers()
    if (authUsersErr) throw authUsersErr
    const { data: shops } = await supabase.from('shops').select('user_id')
    const shopCounts = {}
    shops?.forEach(s => { shopCounts[s.user_id] = (shopCounts[s.user_id] || 0) + 1 })
    const emailMap = {}
    const registeredAtMap = {}
    authUsers?.forEach(u => { emailMap[u.id] = u.email; registeredAtMap[u.id] = u.created_at })
    const profileIds = new Set((profiles || []).map(p => p.id))
    const extraUsers = (authUsers || []).filter(u => !profileIds.has(u.id)).map(u => ({ id: u.id, full_name: u.user_metadata?.full_name || '', plan: 'pro', max_shops: 10, status: 'pending' }))
    const merged = [...(profiles || []), ...extraUsers].map(p => ({ ...p, email: emailMap[p.id] || '', sites: shopCounts[p.id] || 0, registered_at: registeredAtMap[p.id] || p.registered_at || null }))
    return new Response(JSON.stringify(merged), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/admin-users' }
