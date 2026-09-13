import { createAdminClient } from '../_shared/supabase.ts'
import { getAvailableSlots } from '../_shared/slots.ts'
import { handleOptions, json } from '../_shared/http.ts'
import { resolveBusiness } from '../_shared/business.ts'

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const body = await req.json()
    const date = typeof body?.date === 'string' ? body.date : ''
    const serviceSlug = typeof body?.service_slug === 'string' ? body.service_slug : ''
    const businessSlug = typeof body?.business_slug === 'string' ? body.business_slug : null

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z0-9-]{2,80}$/.test(serviceSlug)) {
      return json({ error: 'Data ou serviço inválido.' }, 400)
    }

    const supabase = createAdminClient()
    const business = await resolveBusiness(supabase, { slug: businessSlug })
    if (!business) return json({ error: 'Empresa não encontrada.' }, 404)

    const result = await getAvailableSlots(
      supabase,
      date,
      serviceSlug,
      business.id,
      business.timezone,
    )

    if (!result.service) return json({ error: 'Serviço não encontrado.' }, 404)

    return json({
      date,
      business: { name: business.name, slug: business.slug },
      service: result.service,
      slots: result.slots,
      timezone: business.timezone,
    })
  } catch (error) {
    console.error('availability_error', error)
    return json({ error: 'Não foi possível consultar os horários agora.' }, 500)
  }
})
