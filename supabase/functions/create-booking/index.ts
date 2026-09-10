import { createAdminClient } from '../_shared/supabase.ts'
import { getAvailableSlots } from '../_shared/slots.ts'
import { cleanText, handleOptions, json, normalizeBrazilPhone } from '../_shared/http.ts'
import { createBookingCalendarEvent } from '../_shared/calendar-booking.ts'
import { resolveBusiness } from '../_shared/business.ts'

async function createBookingToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return { token, hash }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function requestIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return req.headers.get('cf-connecting-ip') || forwarded || 'unknown'
}

async function enforceBookingRateLimit(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  phone: string,
  req: Request,
) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const [phoneHash, ipHash] = await Promise.all([
    sha256Hex(phone),
    sha256Hex(requestIp(req)),
  ])

  const [phoneResult, ipResult] = await Promise.all([
    supabase
      .from('booking_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('phone_hash', phoneHash)
      .gte('created_at', since),
    supabase
      .from('booking_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('ip_hash', ipHash)
      .gte('created_at', since),
  ])

  if (phoneResult.error) throw phoneResult.error
  if (ipResult.error) throw ipResult.error
  if ((phoneResult.count ?? 0) >= 3 || (ipResult.count ?? 0) >= 10) return false

  const { error } = await supabase.from('booking_rate_limits').insert({
    business_id: businessId,
    phone_hash: phoneHash,
    ip_hash: ipHash,
  })
  if (error) throw error

  const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { error: cleanupError } = await supabase
    .from('booking_rate_limits')
    .delete()
    .lt('created_at', retentionCutoff)
  if (cleanupError) console.warn('booking_rate_limit_cleanup_failed', cleanupError)

  return true
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 700) : 'Unknown calendar sync error'
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const body = await req.json()
    if (cleanText(body?.website, 200)) return json({ error: 'Não foi possível registrar o agendamento.' }, 400)
    const fullName = cleanText(body?.full_name, 120)
    const phone = normalizeBrazilPhone(body?.phone)
    const email = cleanText(body?.email, 180) || null
    const serviceSlug = cleanText(body?.service_slug, 80)
    const businessSlug = cleanText(body?.business_slug, 80) || null
    const date = cleanText(body?.date, 10)
    const time = cleanText(body?.time, 5)
    const locationType = body?.location_type === 'home_care' ? 'home_care' : 'spa'
    const city = cleanText(body?.city, 100) || null
    const neighborhood = cleanText(body?.neighborhood, 100) || null
    const note = cleanText(body?.note, 700) || null
    const serviceConsent = body?.whatsapp_service_consent === true
    const marketingConsent = body?.whatsapp_marketing_consent === true

    if (!fullName || !phone || !serviceSlug || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return json({ error: 'Preencha corretamente nome, telefone, serviço, data e horário.' }, 400)
    }
    if (!serviceConsent) return json({ error: 'É necessário autorizar as mensagens operacionais do agendamento.' }, 400)
    if (locationType === 'home_care' && (!city || !neighborhood)) {
      return json({ error: 'Informe cidade e bairro para atendimento home care.' }, 400)
    }

    const supabase = createAdminClient()
    const business = await resolveBusiness(supabase, { slug: businessSlug })
    if (!business) return json({ error: 'Empresa não encontrada.' }, 404)

    if (!(await enforceBookingRateLimit(supabase, business.id, phone, req))) {
      return json({ error: 'Muitas tentativas de agendamento. Aguarde um pouco e tente novamente.' }, 429)
    }

    const availability = await getAvailableSlots(
      supabase,
      date,
      serviceSlug,
      business.id,
      business.timezone,
    )
    if (!availability.service) return json({ error: 'Serviço não encontrado.' }, 404)

    const chosen = availability.slots.find((slot) => slot.time === time)
    if (!chosen) return json({ error: 'Esse horário não está mais disponível. Escolha outro horário.' }, 409)

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .upsert({
        business_id: business.id,
        full_name: fullName,
        phone_e164: phone,
        email,
        city,
        neighborhood,
        source: 'website',
        crm_stage: 'waiting_confirmation',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id,phone_e164' })
      .select('id, full_name, phone_e164')
      .single()

    if (clientError) throw clientError

    const { token, hash } = await createBookingToken()
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        business_id: business.id,
        client_id: client.id,
        service_id: availability.service.id,
        status: 'pending',
        location_type: locationType,
        starts_at: chosen.starts_at,
        ends_at: chosen.ends_at,
        home_city: locationType === 'home_care' ? city : null,
        home_neighborhood: locationType === 'home_care' ? neighborhood : null,
        customer_note: note,
        booking_token_hash: hash,
      })
      .select('id, starts_at, ends_at, status')
      .single()

    if (appointmentError) {
      if (appointmentError.code === '23P01' || appointmentError.code === '23505') {
        return json({ error: 'Esse horário acabou de ser reservado. Escolha outro horário.' }, 409)
      }
      throw appointmentError
    }

    const now = new Date().toISOString()
    const location = locationType === 'home_care'
      ? `Home care — ${neighborhood ?? ''}, ${city ?? ''}`
      : (business.address_text || business.name)

    let calendarSynced = false
    let calendarError: string | null = null

    const { data: calendarState, error: calendarStateError } = await supabase
      .from('calendar_sync_state')
      .select('calendar_id')
      .eq('business_id', business.id)
      .maybeSingle()
    if (calendarStateError) throw calendarStateError

    if (calendarState?.calendar_id) {
      try {
        const googleEvent = await createBookingCalendarEvent({
          appointmentId: appointment.id,
          businessId: business.id,
          businessName: business.name,
          clientName: fullName,
          phone,
          serviceName: availability.service.name,
          startsAt: appointment.starts_at,
          endsAt: appointment.ends_at,
          location,
          calendarId: calendarState.calendar_id,
          timeZone: business.timezone,
        })

        const { error: calendarUpdateError } = await supabase.from('appointments').update({
          google_event_id: googleEvent.id,
          google_event_etag: googleEvent.etag ?? null,
          google_event_updated_at: googleEvent.updated ?? null,
          google_last_synced_at: now,
          updated_at: now,
        }).eq('business_id', business.id).eq('id', appointment.id)
        if (calendarUpdateError) throw calendarUpdateError

        const { error: calendarLogError } = await supabase.from('appointment_events').insert({
          business_id: business.id,
          appointment_id: appointment.id,
          event_type: 'google_calendar_created',
          payload: { google_event_id: googleEvent.id, source: 'create_booking' },
        })
        if (calendarLogError) console.warn('booking_calendar_event_log_failed', calendarLogError)

        calendarSynced = true
      } catch (error) {
        calendarError = errorText(error)
        console.error('booking_calendar_sync_failed', error)
      }
    } else {
      calendarError = 'Google Calendar is not connected for this business'
    }

    const consentRows = [
      {
        business_id: business.id,
        client_id: client.id,
        category: 'whatsapp_service',
        granted: true,
        consent_text_version: 'website-v1',
        source: 'website_booking',
        recorded_at: now,
      },
      {
        business_id: business.id,
        client_id: client.id,
        category: 'whatsapp_marketing',
        granted: marketingConsent,
        consent_text_version: 'website-v1',
        source: 'website_booking',
        recorded_at: now,
      },
    ]

    const confirmationKey = `booking-confirmation:${appointment.id}`
    const calendarKey = `google-calendar-create:${appointment.id}`

    const sideEffects = await Promise.allSettled([
      supabase.from('client_consents').insert(consentRows),
      supabase.from('appointment_events').insert({
        business_id: business.id,
        appointment_id: appointment.id,
        event_type: 'booking_requested',
        payload: { source: 'website', marketing_consent: marketingConsent },
      }),
      supabase.from('notification_jobs').insert([
        {
          business_id: business.id,
          appointment_id: appointment.id,
          client_id: client.id,
          job_type: 'whatsapp_booking_confirmation',
          scheduled_for: now,
          idempotency_key: confirmationKey,
        },
        {
          business_id: business.id,
          appointment_id: appointment.id,
          client_id: client.id,
          job_type: 'google_calendar_create',
          scheduled_for: now,
          status: calendarSynced ? 'processed' : 'pending',
          processed_at: calendarSynced ? now : null,
          last_error: calendarError,
          idempotency_key: calendarKey,
        },
      ]),
    ])

    sideEffects.forEach((result, index) => {
      if (result.status === 'rejected') console.error('booking_side_effect_failed', index, result.reason)
    })

    return json({
      ok: true,
      business: { name: business.name, slug: business.slug },
      appointment: {
        id: appointment.id,
        status: appointment.status,
        service: availability.service.name,
        date,
        time,
        starts_at: appointment.starts_at,
        location_type: locationType,
        calendar_synced: calendarSynced,
      },
      booking_token: token,
    }, 201)
  } catch (error) {
    console.error('create_booking_error', error)
    return json({ error: 'Não foi possível concluir o agendamento agora.' }, 500)
  }
})
