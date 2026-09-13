import { Temporal } from 'npm:@js-temporal/polyfill@0.5.1'
import { createAdminClient } from './supabase.ts'
import {
  listCalendarChanges,
  updateCalendarEvent,
  type GoogleCalendarEvent,
} from './google-calendar.ts'
import { resolveBusiness } from './business.ts'

const TIME_ZONE = 'America/Sao_Paulo'

function clean(value: unknown, max = 160) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function eventRange(event: GoogleCalendarEvent) {
  if (event.start?.dateTime && event.end?.dateTime) {
    const start = new Date(event.start.dateTime)
    const end = new Date(event.end.dateTime)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null
    return { startsAt: start.toISOString(), endsAt: end.toISOString(), isAllDay: false }
  }

  if (event.start?.date && event.end?.date) {
    try {
      const start = Temporal.PlainDate.from(event.start.date)
        .toZonedDateTime({ timeZone: TIME_ZONE, plainTime: '00:00' })
        .toInstant()
        .toString()
      const end = Temporal.PlainDate.from(event.end.date)
        .toZonedDateTime({ timeZone: TIME_ZONE, plainTime: '00:00' })
        .toInstant()
        .toString()
      if (Temporal.Instant.compare(Temporal.Instant.from(end), Temporal.Instant.from(start)) <= 0) return null
      return { startsAt: start, endsAt: end, isAllDay: true }
    } catch {
      return null
    }
  }

  return null
}

function sameInstant(left?: string | null, right?: string | null) {
  if (!left || !right) return false
  const a = new Date(left).getTime()
  const b = new Date(right).getTime()
  return Number.isFinite(a) && Number.isFinite(b) && a === b
}

function appointmentEventInput(appointment: any, business: any, calendarId: string) {
  const client = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients
  const service = Array.isArray(appointment.services) ? appointment.services[0] : appointment.services
  const location = appointment.location_type === 'home_care'
    ? `Home care — ${appointment.home_neighborhood ?? ''}, ${appointment.home_city ?? ''}`
    : (business.address_text || business.name)

  return {
    summary: `${service?.name ?? 'Sessão'} — ${client?.full_name ?? 'Cliente'}`,
    description: `Agendamento Massoterapeuta Home\nCliente: ${client?.full_name ?? ''}\nContato: ${client?.phone_e164 ?? ''}\nID: ${appointment.id}`,
    location,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    appointmentId: appointment.id,
    businessId: business.id,
    calendarId,
    timeZone: business.timezone,
  }
}

async function findAppointment(supabase: any, event: GoogleCalendarEvent, businessId: string) {
  const appointmentId = clean(event.extendedProperties?.private?.appointment_id, 80)
  const select = `
    id, client_id, service_id, status, starts_at, ends_at, location_type, home_city, home_neighborhood,
    google_event_id, google_event_etag, google_event_updated_at,
    clients(full_name, phone_e164), services(name)
  `

  if (event.id) {
    const byEvent = await supabase.from('appointments').select(select).eq('business_id', businessId).eq('google_event_id', event.id).maybeSingle()
    if (byEvent.error) throw byEvent.error
    if (byEvent.data) return byEvent.data
  }

  if (appointmentId) {
    const byId = await supabase.from('appointments').select(select).eq('business_id', businessId).eq('id', appointmentId).maybeSingle()
    if (byId.error) throw byId.error
    if (byId.data) return byId.data
  }

  return null
}

async function logAppointmentEvent(supabase: any, businessId: string, appointmentId: string, eventType: string, payload: Record<string, unknown> = {}) {
  const { error } = await supabase.from('appointment_events').insert({
    business_id: businessId,
    appointment_id: appointmentId,
    event_type: eventType,
    payload,
  })
  if (error) console.warn('calendar_appointment_event_log_failed', error)
}

async function reconcileAppointment(supabase: any, business: any, calendarId: string, appointment: any, event: GoogleCalendarEvent) {
  const now = new Date().toISOString()

  if (event.status === 'cancelled') {
    if (appointment.status !== 'cancelled') {
      const { error } = await supabase.from('appointments').update({
        status: 'cancelled',
        cancelled_at: now,
        google_event_etag: event.etag ?? null,
        google_event_updated_at: event.updated ?? null,
        google_last_synced_at: now,
        updated_at: now,
      }).eq('business_id', business.id).eq('id', appointment.id)
      if (error) throw error
      await logAppointmentEvent(supabase, business.id, appointment.id, 'google_calendar_cancelled_from_iphone', {
        google_event_id: event.id,
      })
    }
    return { type: 'appointment_cancelled', eventId: event.id }
  }

  const range = eventRange(event)
  if (!range) return { type: 'appointment_ignored_invalid_range', eventId: event.id }

  const metadataPatch = {
    google_event_id: event.id,
    google_event_etag: event.etag ?? null,
    google_event_updated_at: event.updated ?? null,
    google_last_synced_at: now,
    updated_at: now,
  }

  if (sameInstant(appointment.starts_at, range.startsAt) && sameInstant(appointment.ends_at, range.endsAt)) {
    const { error } = await supabase.from('appointments').update(metadataPatch).eq('business_id', business.id).eq('id', appointment.id)
    if (error) throw error
    return { type: 'appointment_unchanged', eventId: event.id }
  }

  const { error: updateError } = await supabase.from('appointments').update({
    ...metadataPatch,
    starts_at: range.startsAt,
    ends_at: range.endsAt,
  }).eq('business_id', business.id).eq('id', appointment.id)

  if (!updateError) {
    await logAppointmentEvent(supabase, business.id, appointment.id, 'google_calendar_rescheduled_from_iphone', {
      google_event_id: event.id,
      previous_starts_at: appointment.starts_at,
      previous_ends_at: appointment.ends_at,
      starts_at: range.startsAt,
      ends_at: range.endsAt,
    })
    return { type: 'appointment_rescheduled', eventId: event.id }
  }

  // PostgreSQL exclusion violation: another active appointment occupies the requested interval.
  if (updateError.code === '23P01') {
    const reverted = await updateCalendarEvent(event.id, appointmentEventInput(appointment, business, calendarId))
    await supabase.from('appointments').update({
      google_event_etag: reverted?.etag ?? event.etag ?? null,
      google_event_updated_at: reverted?.updated ?? event.updated ?? null,
      google_last_synced_at: now,
      updated_at: now,
    }).eq('business_id', business.id).eq('id', appointment.id)

    await logAppointmentEvent(supabase, business.id, appointment.id, 'google_calendar_conflict_reverted', {
      google_event_id: event.id,
      attempted_starts_at: range.startsAt,
      attempted_ends_at: range.endsAt,
      kept_starts_at: appointment.starts_at,
      kept_ends_at: appointment.ends_at,
    })
    return { type: 'appointment_conflict_reverted', eventId: event.id }
  }

  throw updateError
}

async function reconcileExternalBlock(supabase: any, businessId: string, event: GoogleCalendarEvent) {
  const now = new Date().toISOString()
  const shouldRemove = event.status === 'cancelled' || event.transparency === 'transparent'

  const { data: existing, error: lookupError } = await supabase
    .from('blocked_periods')
    .select('id')
    .eq('business_id', businessId)
    .eq('google_event_id', event.id)
    .maybeSingle()
  if (lookupError) throw lookupError

  if (shouldRemove) {
    if (existing?.id) {
      const { error } = await supabase.from('blocked_periods').delete().eq('business_id', businessId).eq('id', existing.id)
      if (error) throw error
    }
    return { type: 'external_block_removed', eventId: event.id }
  }

  const range = eventRange(event)
  if (!range) return { type: 'external_block_ignored_invalid_range', eventId: event.id }

  const values = {
    business_id: businessId,
    starts_at: range.startsAt,
    ends_at: range.endsAt,
    reason: 'Ocupado — Calendário da Carla',
    source: 'google_calendar',
    google_event_id: event.id,
    google_event_etag: event.etag ?? null,
    google_event_updated_at: event.updated ?? null,
    is_all_day: range.isAllDay,
    updated_at: now,
  }

  if (existing?.id) {
    const { error } = await supabase.from('blocked_periods').update(values).eq('business_id', businessId).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('blocked_periods').insert(values)
    if (error) throw error
  }

  return { type: existing?.id ? 'external_block_updated' : 'external_block_created', eventId: event.id }
}

async function reconcileEvent(supabase: any, business: any, calendarId: string, event: GoogleCalendarEvent) {
  if (!event.id) return { type: 'ignored_no_id', eventId: '' }

  const appointment = await findAppointment(supabase, event, business.id)
  if (appointment) return await reconcileAppointment(supabase, business, calendarId, appointment, event)

  const source = event.extendedProperties?.private?.source
  if (source === 'massoterapeuta-home') {
    // Internal orphan/race: never convert a CRM event into a personal availability block.
    return { type: 'internal_orphan_ignored', eventId: event.id }
  }

  return await reconcileExternalBlock(supabase, business.id, event)
}

async function ensureState(supabase: any, businessId?: string) {
  const business = await resolveBusiness(supabase, { id: businessId })
  if (!business) throw new Error('Business not found for calendar sync')
  const { data, error } = await supabase.from('calendar_sync_state').select('*').eq('business_id', business.id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Google Calendar is not connected for this business')
  return { state: data, business }
}

export async function runCalendarSync(options: { forceFull?: boolean; businessId?: string } = {}) {
  const supabase = createAdminClient()
  const { state, business } = await ensureState(supabase, options.businessId)
  const calendarId = state.calendar_id
  const forceFull = options.forceFull === true
  let syncToken = forceFull ? undefined : (state.sync_token || undefined)
  let mode: 'full' | 'incremental' = syncToken ? 'incremental' : 'full'

  try {
    let result = await listCalendarChanges(syncToken, calendarId)
    if (result.expired) {
      syncToken = undefined
      mode = 'full'
      result = await listCalendarChanges(undefined, calendarId)
    }

    const reconciled: Array<{ type: string; eventId: string }> = []
    const activeExternalIds = new Set<string>()

    for (const event of result.events) {
      const outcome = await reconcileEvent(supabase, business, calendarId, event)
      reconciled.push(outcome)
      if (mode === 'full' && outcome.type.startsWith('external_block_') && !['external_block_removed'].includes(outcome.type)) {
        activeExternalIds.add(event.id)
      }
    }

    if (mode === 'full') {
      const { data: existingBlocks, error: blocksError } = await supabase
        .from('blocked_periods')
        .select('id,google_event_id')
        .eq('business_id', business.id)
        .eq('source', 'google_calendar')
      if (blocksError) throw blocksError

      const staleIds = (existingBlocks ?? [])
        .filter((block: any) => block.google_event_id && !activeExternalIds.has(block.google_event_id))
        .map((block: any) => block.id)
      if (staleIds.length) {
        const { error: deleteError } = await supabase.from('blocked_periods').delete().eq('business_id', business.id).in('id', staleIds)
        if (deleteError) throw deleteError
      }
    }

    const now = new Date().toISOString()
    const statePatch: Record<string, unknown> = {
      sync_token: result.nextSyncToken,
      last_error: null,
      updated_at: now,
      ...(mode === 'full' ? { last_full_sync_at: now } : { last_incremental_sync_at: now }),
    }
    const { error: stateError } = await supabase.from('calendar_sync_state').update(statePatch).eq('business_id', business.id)
    if (stateError) throw stateError

    return {
      mode,
      processed: reconciled.length,
      outcomes: reconciled.reduce((acc: Record<string, number>, item) => {
        acc[item.type] = (acc[item.type] ?? 0) + 1
        return acc
      }, {}),
      nextSyncToken: result.nextSyncToken,
    }
  } catch (error) {
    await supabase.from('calendar_sync_state').update({
      last_error: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown calendar sync error',
      updated_at: new Date().toISOString(),
    }).eq('business_id', business.id)
    throw error
  }
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
