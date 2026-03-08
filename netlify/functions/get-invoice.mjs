import { createClient } from '@supabase/supabase-js'

function buildInvoiceHTML({ invoiceNumber, date, user, amount, vatRate, amountExcl, vatAmount, paid }) {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>Factuur ${invoiceNumber}</title>
<style>
  @media print { body { padding: 0; background: white; } .no-print { display: none; } }
  body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f5f5; margin: 0; padding: 20px; }
  .card { background: #fff; max-width: 620px; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { background: #5B5BD6; padding: 28px 32px; color: white; display: flex; justify-content: space-between; align-items: flex-start; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
  .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
  .body { padding: 28px 32px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px; color: #666; }
  .to { margin-bottom: 20px; font-size: 13px; line-height: 1.7; }
  .to strong { display: block; font-size: 14px; margin-bottom: 4px; color: #1a1a2e; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; }
  th { text-align: left; padding: 8px 10px; background: #f8f8fc; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 10px 10px; border-bottom: 1px solid #f0f0f0; }
  .totals td { border: none; padding: 5px 10px; }
  .totals .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #5B5BD6; padding-top: 10px; }
  .paid-badge { display: inline-block; background: #dcfce7; color: #16a34a; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 16px; }
  .footer { padding: 16px 32px; background: #f8f8fc; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; }
  .print-btn { display: block; max-width: 620px; margin: 16px auto 0; padding: 10px; background: #5B5BD6; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; text-align: center; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">⬇ Downloaden / Afdrukken</button>
<div class="card">
  <div class="header">
    <div>
      <h1>WooSyncShop</h1>
      <p>Factuur</p>
    </div>
    <div style="text-align:right; font-size:12px; opacity:0.9; line-height:1.6;">
      <div style="font-weight:700; font-size:13px;">Webs Media</div>
      <div style="opacity:0.8;">De Wittenkade 152H</div>
      <div style="opacity:0.8;">1051 AN Amsterdam</div>
      <div style="opacity:0.7; font-size:11px; margin-top:4px;">${invoiceNumber} · ${date}</div>
    </div>
  </div>
  <div class="body">
    <div class="meta">
      <span>Factuurnummer: <strong style="color:#1a1a2e">${invoiceNumber}</strong></span>
      <span>Datum: <strong style="color:#1a1a2e">${date}</strong></span>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:12px; gap:20px;">
      <div class="to" style="margin:0; flex:1;">
        <strong>Aan:</strong>
      ${user.business_name ? `<span>${user.business_name}</span><br>` : ''}
      <span>${user.full_name || user.email}</span><br>
      <span style="color:#666">${user.email}</span>
      ${user.address_street ? `<br><span>${user.address_street}</span>` : ''}
      ${user.address_zip || user.address_city ? `<br><span>${[user.address_zip, user.address_city].filter(Boolean).join(' ')}</span>` : ''}
      ${user.country ? `<br><span>${user.country}</span>` : ''}
      ${user.vat_number ? `<br><span style="color:#666">BTW: ${user.vat_number}${user.vat_validated ? ' ✓' : ''}</span>` : ''}
      </div>
      <div style="text-align:right; color:#555; line-height:1.7;">
        <strong style="color:#1a1a2e;">Webs Media</strong><br>
        De Wittenkade 152H<br>
        1051 AN Amsterdam<br>
        <span style="color:#888; font-size:11px;">KVK: 59853824</span><br>
        <span style="color:#888; font-size:11px;">BTW: NL001529194B75</span><br>
        <span style="color:#888; font-size:11px;">IBAN: NL29 ABNA 0439 6716 47</span><br>
        <span style="color:#888; font-size:11px;">BIC: ABNANL2A</span>
      </div>
    </div>
    <table>
      <thead><tr><th>Omschrijving</th><th style="text-align:right">Bedrag</th></tr></thead>
      <tbody>
        <tr><td>WooSyncShop abonnement<br><small style="color:#888">Factuurnummer: ${invoiceNumber}</small></td><td style="text-align:right">€${amountExcl}</td></tr>
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
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url, 'https://woosyncshop.com')
  const invoiceId = url.searchParams.get('id')
  const paymentId = url.searchParams.get('payment_id')

  const isSuperAdmin = user.email === 'leadingvation@gmail.com'

  // Fetch invoice — must belong to this user (or superadmin can access any)
  let invoice
  if (invoiceId) {
    const q = supabase.from('invoices').select('*').eq('id', invoiceId)
    if (!isSuperAdmin) q.eq('user_id', user.id)
    const { data } = await q.single()
    invoice = data
  } else if (paymentId) {
    const q = supabase.from('invoices').select('*').eq('payment_id', paymentId)
    if (!isSuperAdmin) q.eq('user_id', user.id)
    const { data } = await q.single()
    invoice = data
  }

  // If no invoice in DB but we have a payment_id, try to create one on the fly
  if (!invoice && paymentId) {
    try {
      const mollieKey = (await supabase.from('platform_settings').select('mollie_api_key').eq('id', 1).single()).data?.mollie_api_key
      if (mollieKey) {
        const mpRes = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, { headers: { Authorization: `Bearer ${mollieKey}` } })
        const mp = await mpRes.json()
        if (mp.status === 'paid' && mp.metadata?.supabase_user_id) {
          const uid = mp.metadata.supabase_user_id
          // Generate invoice number
          const year = new Date().getFullYear()
          const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).like('invoice_number', `WSS-${year}-%`)
          const seq = String((count || 0) + 1).padStart(4, '0')
          const invoiceNumber = `WSS-${year}-${seq}`
          const amount = parseFloat(mp.amount?.value || 0)
          const vatRate = 21
          const amountExcl = parseFloat((amount / 1.21).toFixed(2))
          const vatAmt = parseFloat((amount - amountExcl).toFixed(2))
          const { data: newInv } = await supabase.from('invoices').insert({
            user_id: uid, payment_id: paymentId, invoice_number: invoiceNumber,
            amount, amount_excl_vat: amountExcl, vat_amount: vatAmt, vat_rate: vatRate,
            issued_at: new Date().toISOString(), paid: true,
          }).select().single()
          invoice = newInv
        }
      }
    } catch {}
  }

  if (!invoice) return new Response('Invoice not found', { status: 404 })

  // Fetch user profile for address details
  const invoiceOwner = invoice.user_id
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', invoiceOwner).single()
  const { data: authUser } = await supabase.auth.admin.getUserById(invoiceOwner)
  const email = authUser?.user?.email || user.email || ''

  const date = new Date(invoice.issued_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const amount = parseFloat(invoice.amount || 0).toFixed(2).replace('.', ',')
  const amountExcl = parseFloat(invoice.amount_excl_vat || 0).toFixed(2).replace('.', ',')
  const vatAmount = parseFloat(invoice.vat_amount || 0).toFixed(2).replace('.', ',')
  const vatRate = invoice.vat_rate ?? 21

  const html = buildInvoiceHTML({
    invoiceNumber: invoice.invoice_number,
    date,
    user: { ...profile, email, full_name: profile?.full_name || authUser?.user?.user_metadata?.full_name || '' },
    amount,
    amountExcl,
    vatAmount,
    vatRate,
    paid: invoice.paid,
  })

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="factuur-${invoice.invoice_number}.html"`,
    }
  })
}

export const config = { path: '/api/get-invoice' }
