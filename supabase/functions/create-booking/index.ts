import { createAdminClient } from '../_shared/supabase.ts'
import { getAvailableSlots } from '../_shared/slots.ts'
import { cleanText, handleOptions, json, normalizeBrazilPhone } from '../_shared/http.ts'
import { createBookingCalendarEvent } from '../_shared/calendar-booking.ts'

async function createBookingToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return { token, hash }
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
    const fullName = cleanText(body?.full_name, 120)
    const phone = normalizeBrazilPhone(body?.phone)
    const email = cleanText(body?.email, 180) || null
    const serviceSlug = cleanText(body?.service_slug, 80)
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

    if (!serviceConsent) {
      return json({ error: 'É necessário autorizar as mensagens operacionais do agendamento.' }, 400)
    }

    if (locationType === 'home_care' && (!city || !neighborhood)) {
      return json({ error: 'Informe cidade e bairro para atendimento home care.' }, 400)
    }

    const supabase = createAdminClient()
    const availability = await getAvailableSlots(supabase, date, serviceSlug)
    if (!availability.service) return json({ error: 'Serviço não encontrado.' }, 404)

    const chosen = availability.slots.find((slot) => slot.time === time)
    if (!chosen) {
      return json({ error: 'Esse horário não está mais disponível. Escolha outro horário.' }, 409)
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .upsert({
        full_name: fullName,
        phone_e164: phone,
        email,
        city,
        neighborhood,
        source: 'website',
        crm_stage: 'waiting_confirmation',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'phone_e164' })
      .select('id, full_name, phone_e164')
      .single()

    if (clientError) throw clientError

    const { token, hash } = await createBookingToken()
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
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
      : 'Spa Carla Lira — R. Samuel Fragoso Coimbra, 483, Valinhos - SP'

    let calendarSynced = false
    let calendarError: string | null = null

    try {
      const googleEvent = await createBookingCalendarEvent({
        appointmentId: appointment.id,
        clientName: fullName,
        phone,
        serviceName: availability.service.name,
        startsAt: appointment.starts_at,
        endsAt: appointment.ends_at,
        location,
      })

      const { error: calendarUpdateError } = await supabase.from('appointments').update({
        google_event_id: googleEvent.id,
        google_event_etag: googleEvent.etag ?? null,
        google_event_updated_at: googleEvent.updated ?? null,
        google_last_synced_at: now,
        updated_at: now,
      }).eq('id', appointment.id)
      if (calendarUpdateError) throw calendarUpdateError

      const { error: calendarLogError } = await supabase.from('appointment_events').insert({
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

    const consentRows = [
      {
        client_id: client.id,
        category: 'whatsapp_service',
        granted: true,
        consent_text_version: 'website-v1',
        source: 'website_booking',
        recorded_at: now,
      },
      {
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
        appointment_id: appointment.id,
        event_type: 'booking_requested',
        payload: { source: 'website', marketing_consent: marketingConsent },
      }),
      supabase.from('notification_jobs').insert([
        {
          appointment_id: appointment.id,
          client_id: client.id,
          job_type: 'whatsapp_booking_confirmation',
          scheduled_for: now,
          idempotency_key: confirmationKey,
        },
        {
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
