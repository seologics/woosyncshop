import { createClient } from '@supabase/supabase-js'

async function log(supabase, level, message, meta = {}) {
  try { await supabase.from('system_logs').insert({ level, function_name: 'vies-check', message, metadata: meta }) } catch {}
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }

  const { vat_number } = body
  if (!vat_number || vat_number.length < 4) return new Response(JSON.stringify({ valid: false, error: 'Ongeldig BTW-nummer' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const clean = vat_number.replace(/[\s.\-]/g, '').toUpperCase()
  const countryCode = clean.slice(0, 2)
  const number = clean.slice(2)

  if (!/^[A-Z]{2}$/.test(countryCode)) return new Response(JSON.stringify({ valid: false, error: 'Ongeldige landcode' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  // Init Supabase for logging only (no auth needed for VAT check)
  const supabase = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Body><urn:checkVat><urn:countryCode>${countryCode}</urn:countryCode><urn:vatNumber>${number}</urn:vatNumber></urn:checkVat></soapenv:Body>
</soapenv:Envelope>`

  try {
    const res = await fetch('https://ec.europa.eu/taxation_customs/vies/services/checkVatService', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
      body: soap,
    })

    if (!res.ok) {
      await log(supabase, 'warn', 'VIES service unavailable', { vat_number: clean, http_status: res.status })
      return new Response(JSON.stringify({ valid: null, error: 'VIES tijdelijk niet beschikbaar', retry: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const xml = await res.text()
    const valid = xml.includes('<valid>true</valid>')
    const nameMatch = xml.match(/<name>([\s\S]*?)<\/name>/)
    const name = nameMatch ? nameMatch[1].replace('---', '').trim() : null

    await log(supabase, 'info', `VAT check: ${clean} → ${valid ? 'valid' : 'invalid'}`, { vat_number: clean, country: countryCode, valid, company_name: name || null })

    return new Response(JSON.stringify({ valid, name, country: countryCode, raw_number: number }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    await log(supabase, 'warn', 'VIES check exception', { vat_number: clean, error: err.message })
    return new Response(JSON.stringify({ valid: null, error: 'VIES tijdelijk niet beschikbaar', retry: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

export const config = { path: '/api/vies-check' }
