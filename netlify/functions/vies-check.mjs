export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { vat_number } = body
  if (!vat_number || vat_number.length < 4) {
    return new Response(JSON.stringify({ valid: false, error: 'Ongeldig BTW-nummer' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // Strip spaces and dots, ensure uppercase
  const clean = vat_number.replace(/[\s.]/g, '').toUpperCase()
  const countryCode = clean.slice(0, 2)
  const number = clean.slice(2)

  // EU VIES SOAP check
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${countryCode}</urn:countryCode>
      <urn:vatNumber>${number}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`

  try {
    const res = await fetch('https://ec.europa.eu/taxation_customs/vies/services/checkVatService', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
      body: soap,
    })

    const xml = await res.text()
    const valid = xml.includes('<valid>true</valid>')
    const nameMatch = xml.match(/<name>(.*?)<\/name>/)
    const name = nameMatch ? nameMatch[1].trim() : null

    return new Response(JSON.stringify({ valid, name, country: countryCode }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    // VIES temporarily unavailable — be lenient
    return new Response(JSON.stringify({ valid: null, error: 'VIES tijdelijk niet beschikbaar', retry: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = { path: '/api/vies-check' }
