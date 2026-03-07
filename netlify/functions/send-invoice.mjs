import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const FROM_EMAIL = 'info@woosyncshop.com'

function buildInvoiceNumber(id) {
  const year = new Date().getFullYear()
  const num = String(id).padStart(4, '0')
  return `WSS-${year}-${num}`
}

function buildInvoiceHTML({ invoiceNumber, date, user, amount, vatRate, amountExcl, vatAmount, paid }) {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>Factuur ${invoiceNumber}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f5f5; margin: 0; padding: 20px; }
  .card { background: #fff; max-width: 600px; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { background: #5B5BD6; padding: 28px 32px; color: white; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
  .body { padding: 28px 32px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px; color: #666; }
  .to { margin-bottom: 20px; }
  .to strong { display: block; font-size: 14px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; }
  th { text-align: left; padding: 8px 10px; background: #f8f8fc; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 10px 10px; border-bottom: 1px solid #f0f0f0; }
  .totals td { border: none; padding: 5px 10px; }
  .totals .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #5B5BD6; padding-top: 10px; }
  .paid-badge { display: inline-block; background: #dcfce7; color: #16a34a; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 16px; }
  .footer { padding: 16px 32px; background: #f8f8fc; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>Woo SyncShop</h1>
    <p>Factuur</p>
  </div>
  <div class="body">
    <div class="meta">
      <span>Factuurnummer: <strong>${invoiceNumber}</strong></span>
      <span>Datum: <strong>${date}</strong></span>
    </div>
    <div class="to">
      <strong>Aan:</strong>
      ${user.business_name ? `<span>${user.business_name}</span><br>` : ''}
      <span>${user.full_name || user.email}</span><br>
      <span>${user.email}</span>
      ${user.address_street ? `<br><span>${user.address_street}</span>` : ''}
      ${user.address_zip || user.address_city ? `<br><span>${[user.address_zip, user.address_city].filter(Boolean).join(' ')}</span>` : ''}
      ${user.country ? `<br><span>${user.country}</span>` : ''}
      ${user.vat_number ? `<br><span>BTW: ${user.vat_number}${user.vat_validated ? ' ✓' : ''}</span>` : ''}
    </div>
    <table>
      <thead><tr><th>Omschrijving</th><th style="text-align:right">Bedrag</th></tr></thead>
      <tbody>
        <tr><td>WooSyncShop Pro – maandabonnement<br><small style="color:#888">Tot 10 WordPress installaties</small></td><td style="text-align:right">€${amountExcl}</td></tr>
      </tbody>
    </table>
    <table class="totals">
      <tr><td style="color:#888">Subtotaal</td><td style="text-align:right">€${amountExcl}</td></tr>
      <tr><td style="color:#888">BTW (${vatRate}%)</td><td style="text-align:right">€${vatAmount}</td></tr>
      <tr class="total-row"><td>Totaal</td><td style="text-align:right">€${amount}</td></tr>
    </table>
    ${paid ? '<div class="paid-badge">✓ Betaald</div>' : ''}
  </div>
  <div class="footer">WooSyncShop · woosyncshop.com · info@woosyncshop.com</div>
</div>
</body></html>`
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  try {
    const { user_id, payment_id, amount, mollie_method } = await req.json()
    if (!user_id || !amount) return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // Get user profile
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user_id).single()
    const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
    const email = authUser?.user?.email || ''
    if (!email) return new Response(JSON.stringify({ error: 'User email not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    // Get notify email for superadmin CC
    const { data: settings } = await supabase.from('platform_settings').select('contact_notification_email').eq('id', 1).single()
    const adminEmail = settings?.contact_notification_email || 'leadingvation@gmail.com'

    // Build invoice number from count of existing invoices
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true })
    const invoiceSeq = (count || 0) + 1
    const invoiceNumber = buildInvoiceNumber(invoiceSeq)
    const date = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })

    // Compute VAT breakdown
    const totalFloat = parseFloat(amount)
    const vatRate = profile?.vat_rate ?? 21
    const isReverseCharge = profile?.country && profile.country !== 'NL' && profile?.vat_validated
    const amountExclFloat = isReverseCharge ? totalFloat : parseFloat((totalFloat / (1 + vatRate / 100)).toFixed(2))
    const vatAmountFloat = isReverseCharge ? 0 : parseFloat((totalFloat - amountExclFloat).toFixed(2))
    const amountExcl = amountExclFloat.toFixed(2).replace('.', ',')
    const vatAmount = vatAmountFloat.toFixed(2).replace('.', ',')
    const amountFormatted = totalFloat.toFixed(2).replace('.', ',')

    // Save invoice to DB
    const { data: invoice } = await supabase.from('invoices').insert({
      user_id,
      invoice_number: invoiceNumber,
      payment_id: payment_id || null,
      amount: totalFloat,
      amount_excl_vat: amountExclFloat,
      vat_amount: vatAmountFloat,
      vat_rate: isReverseCharge ? 0 : vatRate,
      mollie_method: mollie_method || null,
      paid: true,
      issued_at: new Date().toISOString(),
    }).select().single()

    // Build HTML
    const html = buildInvoiceHTML({
      invoiceNumber,
      date,
      user: { ...profile, email, full_name: profile?.full_name || authUser?.user?.user_metadata?.full_name || '' },
      amount: amountFormatted,
      amountExcl,
      vatAmount,
      vatRate: isReverseCharge ? '0 (btw verlegd)' : vatRate,
      paid: true,
    })

    // Send via SES SMTP
    const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
    const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
    const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`

    const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })

    await transporter.sendMail({
      from: `"WooSyncShop" <${FROM_EMAIL}>`,
      to: email,
      bcc: adminEmail,
      subject: `Factuur ${invoiceNumber} – WooSyncShop Pro`,
      html,
    })

    await supabase.from('system_logs').insert({
      level: 'info',
      function_name: 'send-invoice',
      message: `Invoice ${invoiceNumber} sent to ${email}`,
      metadata: { user_id, invoice_number: invoiceNumber, amount: totalFloat },
    })

    return new Response(JSON.stringify({ ok: true, invoice_number: invoiceNumber, invoice_id: invoice?.id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('send-invoice error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/send-invoice' }
