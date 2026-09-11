import { requireAdmin } from '../_shared/auth.ts'
import { cleanText, handleOptions, json } from '../_shared/http.ts'
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '../_shared/google-calendar.ts'
import { resolveBusiness, userCanAccessBusiness } from '../_shared/business.ts'

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const auth = await requireAdmin(req)
    if (!auth) return json({ error: 'Acesso não autorizado.' }, 403)

    const body = await req.json()
    const appointmentId = cleanText(body?.appointment_id, 80)
    const action = ['create', 'update', 'delete'].includes(body?.action) ? body.action : 'update'
    if (!appointmentId) return json({ error: 'Agendamento inválido.' }, 400)

    const { data: appointment, error } = await auth.supabase
      .from('appointments')
      .select(`
        id, business_id, starts_at, ends_at, status, location_type, home_city, home_neighborhood,
        google_event_id, google_event_etag, google_event_updated_at,
        clients!inner(full_name, phone_e164),
        services!inner(name)
      `)
      .eq('id', appointmentId)
      .maybeSingle()

    if (error) throw error
    if (!appointment) return json({ error: 'Agendamento não encontrado.' }, 404)

    const business = await resolveBusiness(auth.supabase, { id: appointment.business_id })
    if (!business || !(await userCanAccessBusiness(auth.supabase, auth.user.id, business.id))) {
      return json({ error: 'Acesso negado para esta empresa.' }, 403)
    }
    const { data: calendarState, error: calendarStateError } = await auth.supabase
      .from('calendar_sync_state')
      .select('calendar_id')
      .eq('business_id', business.id)
      .maybeSingle()
    if (calendarStateError) throw calendarStateError
    if (!calendarState?.calendar_id) return json({ error: 'Google Calendar não conectado para esta empresa.' }, 409)

    const client = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients
    const service = Array.isArray(appointment.services) ? appointment.services[0] : appointment.services
    const now = new Date().toISOString()

    if (action === 'delete' || appointment.status === 'cancelled') {
      if (appointment.google_event_id) {
        await deleteCalendarEvent(appointment.google_event_id, calendarState.calendar_id)
        await auth.supabase.from('appointments').update({
          google_event_id: null,
          google_event_etag: null,
          google_event_updated_at: null,
          google_last_synced_at: now,
          updated_at: now,
        }).eq('business_id', business.id).eq('id', appointment.id)
      }
      await auth.supabase.from('appointment_events').insert({
        business_id: business.id,
        appointment_id: appointment.id,
        event_type: 'google_calendar_deleted',
        actor_user_id: auth.user.id,
      })
      return json({ ok: true, action: 'deleted' })
    }

    const location = appointment.location_type === 'home_care'
      ? `Home care — ${appointment.home_neighborhood ?? ''}, ${appointment.home_city ?? ''}`
      : (business.address_text || business.name)

    const eventInput = {
      summary: `${service?.name ?? 'Sessão'} — ${client?.full_name ?? 'Cliente'}`,
      description: `Agendamento Massoterapeuta Home\nCliente: ${client?.full_name ?? ''}\nContato: ${client?.phone_e164 ?? ''}\nID: ${appointment.id}`,
      location,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      appointmentId: appointment.id,
      businessId: business.id,
      calendarId: calendarState.calendar_id,
      timeZone: business.timezone,
    }

    let googleEvent
    let eventType
    if (appointment.google_event_id) {
      googleEvent = await updateCalendarEvent(appointment.google_event_id, eventInput)
      eventType = 'google_calendar_updated'
    } else {
      googleEvent = await createCalendarEvent(eventInput)
      eventType = 'google_calendar_created'
    }

    await auth.supabase.from('appointments').update({
      google_event_id: googleEvent?.id ?? appointment.google_event_id,
      google_event_etag: googleEvent?.etag ?? null,
      google_event_updated_at: googleEvent?.updated ?? null,
      google_last_synced_at: now,
      updated_at: now,
    }).eq('business_id', business.id).eq('id', appointment.id)

    await auth.supabase.from('appointment_events').insert({
      business_id: business.id,
      appointment_id: appointment.id,
      event_type: eventType,
      actor_user_id: auth.user.id,
      payload: { google_event_id: googleEvent?.id ?? appointment.google_event_id },
    })

    return json({ ok: true, google_event_id: googleEvent?.id ?? appointment.google_event_id })
  } catch (error) {
    console.error('google_calendar_sync_error', error)
    return json({ error: 'Não foi possível sincronizar com o Google Calendar.' }, 500)
  }
})
