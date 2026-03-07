import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import PDFDocument from 'pdfkit'

const FROM_EMAIL = 'info@woosyncshop.com'

function buildInvoiceNumber(seq) {
  const year = new Date().getFullYear()
  return `WSS-${year}-${String(seq).padStart(4, '0')}`
}

// Generate PDF buffer using pdfkit (pure Node.js, no binary deps)
async function buildInvoicePDF({ invoiceNumber, date, user, amount, amountExcl, vatAmount, vatRate, paid }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const purple = '#5B5BD6'
    const dark = '#1a1a2e'
    const gray = '#666666'
    const lightgray = '#f8f8fc'
    const pageW = doc.page.width - 100 // margins

    // Header bar
    doc.rect(50, 50, pageW, 70).fill(purple)
    doc.fontSize(20).fillColor('#ffffff').font('Helvetica-Bold').text('WooSyncShop', 65, 68)
    doc.fontSize(11).font('Helvetica').fillColor('rgba(255,255,255,0.85)').text('Factuur', 65, 93)
    // Invoice number top-right in header
    doc.fontSize(11).fillColor('#ffffff').text(invoiceNumber, 350, 68, { width: pageW - 300, align: 'right' })
    doc.fontSize(9).fillColor('rgba(255,255,255,0.75)').text(date, 350, 88, { width: pageW - 300, align: 'right' })

    let y = 145

    // Meta row
    doc.fontSize(9).fillColor(gray).font('Helvetica')
    doc.text('Factuurnummer:', 50, y)
    doc.font('Helvetica-Bold').fillColor(dark).text(invoiceNumber, 130, y)
    doc.font('Helvetica').fillColor(gray).text('Datum:', 350, y)
    doc.font('Helvetica-Bold').fillColor(dark).text(date, 390, y)

    y += 30

    // "Aan" block
    doc.font('Helvetica-Bold').fontSize(10).fillColor(dark).text('Aan:', 50, y)
    y += 16
    doc.font('Helvetica').fontSize(10).fillColor(dark)
    if (user.business_name) { doc.text(user.business_name, 50, y); y += 15 }
    if (user.full_name) { doc.text(user.full_name, 50, y); y += 15 }
    doc.fillColor(gray).text(user.email, 50, y); y += 15
    if (user.address_street) { doc.fillColor(dark).text(user.address_street, 50, y); y += 15 }
    const zipCity = [user.address_zip, user.address_city].filter(Boolean).join(' ')
    if (zipCity) { doc.text(zipCity, 50, y); y += 15 }
    if (user.country) { doc.text(user.country, 50, y); y += 15 }
    if (user.vat_number) { doc.fillColor(gray).text(`BTW: ${user.vat_number}${user.vat_validated ? ' ✓' : ''}`, 50, y); y += 15 }

    y += 20

    // Table header
    doc.rect(50, y, pageW, 26).fill(lightgray)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(gray)
    doc.text('OMSCHRIJVING', 62, y + 9)
    doc.text('BEDRAG', 50 + pageW - 60, y + 9, { width: 60, align: 'right' })
    y += 26

    // Table row
    doc.rect(50, y, pageW, 1).fill('#f0f0f0')
    y += 1
    doc.font('Helvetica').fontSize(10).fillColor(dark)
    doc.text('WooSyncShop Pro – maandabonnement', 62, y + 10)
    doc.fontSize(9).fillColor(gray).text('Tot 10 WordPress installaties', 62, y + 24)
    doc.fontSize(10).fillColor(dark).font('Helvetica').text(`€${amountExcl}`, 50 + pageW - 60, y + 10, { width: 60, align: 'right' })
    y += 50

    // Totals section
    doc.rect(50, y, pageW, 1).fill('#f0f0f0'); y += 8
    const totalsX = 350

    doc.font('Helvetica').fontSize(10).fillColor(gray)
    doc.text('Subtotaal', totalsX, y)
    doc.fillColor(dark).text(`€${amountExcl}`, 50 + pageW - 60, y, { width: 60, align: 'right' })
    y += 18
    doc.fillColor(gray).text(`BTW (${vatRate}%)`, totalsX, y)
    doc.fillColor(dark).text(`€${vatAmount}`, 50 + pageW - 60, y, { width: 60, align: 'right' })
    y += 8

    // Total row with top border
    doc.rect(totalsX, y, pageW - (totalsX - 50), 2).fill(purple); y += 10
    doc.font('Helvetica-Bold').fontSize(12).fillColor(dark)
    doc.text('Totaal', totalsX, y)
    doc.text(`€${amount}`, 50 + pageW - 60, y, { width: 60, align: 'right' })
    y += 30

    // Paid badge
    if (paid) {
      doc.rect(50, y, 100, 22).fill('#dcfce7')
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#16a34a').text('✓ Betaald', 56, y + 6)
    }

    // Footer
    const footerY = doc.page.height - 60
    doc.rect(50, footerY - 10, pageW, 1).fill('#eeeeee')
    doc.font('Helvetica').fontSize(9).fillColor(gray)
    doc.text('WooSyncShop  ·  woosyncshop.com  ·  info@woosyncshop.com', 50, footerY, { width: pageW, align: 'center' })

    doc.end()
  })
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

    // ── DUPLICATE GUARD ─────────────────────────────────────────────────────
    // If we already have an invoice for this payment_id, return it without creating a duplicate
    if (payment_id) {
      const { data: existing } = await supabase.from('invoices').select('id, invoice_number').eq('payment_id', payment_id).maybeSingle()
      if (existing) {
        await supabase.from('system_logs').insert({
          level: 'warn', function_name: 'send-invoice',
          message: `Duplicate invoice request blocked for payment ${payment_id}`,
          metadata: { user_id, payment_id, existing_invoice: existing.invoice_number },
        })
        return new Response(JSON.stringify({ ok: true, invoice_number: existing.invoice_number, invoice_id: existing.id, duplicate: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    }

    // Get user profile
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user_id).single()
    const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
    const email = authUser?.user?.email || ''
    if (!email) return new Response(JSON.stringify({ error: 'User email not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    // Get notify email for BCC
    const { data: settings } = await supabase.from('platform_settings').select('contact_notification_email').eq('id', 1).single()
    const adminEmail = settings?.contact_notification_email || 'leadingvation@gmail.com'

    // Build invoice number from count of existing invoices (unique seq)
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true })
    const invoiceNumber = buildInvoiceNumber((count || 0) + 1)
    const date = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })

    // VAT breakdown
    const totalFloat = parseFloat(amount)
    const vatRate = profile?.vat_rate ?? 21
    const isReverseCharge = profile?.country && profile.country !== 'NL' && profile?.vat_validated
    const amountExclFloat = isReverseCharge ? totalFloat : parseFloat((totalFloat / (1 + vatRate / 100)).toFixed(2))
    const vatAmountFloat = isReverseCharge ? 0 : parseFloat((totalFloat - amountExclFloat).toFixed(2))
    const amountExcl = amountExclFloat.toFixed(2).replace('.', ',')
    const vatAmount = vatAmountFloat.toFixed(2).replace('.', ',')
    const amountFormatted = totalFloat.toFixed(2).replace('.', ',')
    const vatRateDisplay = isReverseCharge ? '0 (btw verlegd)' : vatRate
    const userObj = { ...profile, email, full_name: profile?.full_name || authUser?.user?.user_metadata?.full_name || '' }

    // Save invoice to DB first (so we have the ID)
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

    // Generate PDF
    const pdfBuffer = await buildInvoicePDF({
      invoiceNumber, date, user: userObj,
      amount: amountFormatted, amountExcl, vatAmount,
      vatRate: vatRateDisplay, paid: true,
    })

    // Send via SES SMTP with PDF attachment
    const smtpUser = Netlify.env.get('AWS_SES_ACCESS_KEY_ID')
    const smtpPass = Netlify.env.get('AWS_SES_SMTP_PASSWORD')
    const smtpHost = `email-smtp.${Netlify.env.get('AWS_SES_REGION') || 'eu-west-1'}.amazonaws.com`

    const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })

    await transporter.sendMail({
      from: `"WooSyncShop" <${FROM_EMAIL}>`,
      to: email,
      bcc: adminEmail,
      subject: `Factuur ${invoiceNumber} – WooSyncShop Pro`,
      html: `<p>Beste${userObj.full_name ? ` ${userObj.full_name.split(' ')[0]}` : ''},</p>
<p>Bedankt voor je betaling! Hierbij ontvang je de factuur voor je WooSyncShop Pro abonnement.</p>
<p>Je kunt de factuur downloaden als PDF via de bijlage.</p>
<p>Met vriendelijke groet,<br>Het WooSyncShop team</p>`,
      attachments: [{
        filename: `factuur-${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    })

    await supabase.from('system_logs').insert({
      level: 'info', function_name: 'send-invoice',
      message: `Invoice ${invoiceNumber} sent to ${email} (with PDF)`,
      metadata: { user_id, invoice_number: invoiceNumber, amount: totalFloat },
    })

    return new Response(JSON.stringify({ ok: true, invoice_number: invoiceNumber, invoice_id: invoice?.id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('send-invoice error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/send-invoice' }
