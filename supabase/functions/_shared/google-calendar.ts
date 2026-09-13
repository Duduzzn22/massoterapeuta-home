import { createAdminClient } from './supabase.ts'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

function env(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function getRefreshToken() {
  const configured = Deno.env.get('GOOGLE_REFRESH_TOKEN')
  if (configured) return configured

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_google_refresh_token')
  if (error) throw new Error(`Unable to read Google refresh token: ${error.message}`)
  if (typeof data !== 'string' || !data) throw new Error('Google Calendar is not authorized yet')
  return data
}

export function getCalendarId(configured?: string | null) {
  return configured || env('GOOGLE_CALENDAR_ID')
}

export function getCalendarWebhookUrl() {
  const configured = Deno.env.get('GOOGLE_CALENDAR_WEBHOOK_URL')
  if (configured) return configured
  return `${env('SUPABASE_URL')}/functions/v1/google-calendar-webhook`
}

async function accessToken() {
  const body = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    refresh_token: await getRefreshToken(),
    grant_type: 'refresh_token',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = await response.json()
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth ${response.status}: ${JSON.stringify(data)}`)
  }
  return data.access_token as string
}

async function googleRequestRaw(path: string, init: RequestInit = {}) {
  const token = await accessToken()
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (response.status === 204) return { status: 204, data: null }
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

async function googleRequest(path: string, init: RequestInit = {}) {
  const result = await googleRequestRaw(path, init)
  if (result.status >= 200 && result.status < 300) return result.data
  throw new Error(`Google Calendar ${result.status}: ${JSON.stringify(result.data)}`)
}

export type GoogleCalendarEvent = {
  id: string
  status?: string
  etag?: string
  updated?: string
  summary?: string
  transparency?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  extendedProperties?: { private?: Record<string, string> }
}

export async function createCalendarEvent(input: {
  summary: string
  description?: string
  location?: string
  startsAt: string
  endsAt: string
  appointmentId?: string
  businessId?: string
  calendarId?: string
  timeZone?: string
}) {
  const calendarId = encodeURIComponent(getCalendarId(input.calendarId))
  return await googleRequest(`/calendars/${calendarId}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? '',
      location: input.location ?? '',
      start: { dateTime: input.startsAt, timeZone: input.timeZone || 'America/Sao_Paulo' },
      end: { dateTime: input.endsAt, timeZone: input.timeZone || 'America/Sao_Paulo' },
      extendedProperties: {
        private: {
          source: 'massoterapeuta-home',
          ...(input.appointmentId ? { appointment_id: input.appointmentId } : {}),
          ...(input.businessId ? { business_id: input.businessId } : {}),
        },
      },
    }),
  })
}

export async function updateCalendarEvent(eventId: string, input: {
  summary: string
  description?: string
  location?: string
  startsAt: string
  endsAt: string
  appointmentId?: string
  businessId?: string
  calendarId?: string
  timeZone?: string
}) {
  const calendarId = encodeURIComponent(getCalendarId(input.calendarId))
  return await googleRequest(`/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? '',
      location: input.location ?? '',
      start: { dateTime: input.startsAt, timeZone: input.timeZone || 'America/Sao_Paulo' },
      end: { dateTime: input.endsAt, timeZone: input.timeZone || 'America/Sao_Paulo' },
      extendedProperties: {
        private: {
          source: 'massoterapeuta-home',
          ...(input.appointmentId ? { appointment_id: input.appointmentId } : {}),
          ...(input.businessId ? { business_id: input.businessId } : {}),
        },
      },
    }),
  })
}

export async function deleteCalendarEvent(eventId: string, configuredCalendarId?: string) {
  const calendarId = encodeURIComponent(getCalendarId(configuredCalendarId))
  const result = await googleRequestRaw(`/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  })
  if (result.status === 404 || result.status === 410 || result.status === 204) return null
  if (result.status >= 200 && result.status < 300) return result.data
  throw new Error(`Google Calendar ${result.status}: ${JSON.stringify(result.data)}`)
}

export async function listCalendarChanges(syncToken?: string, configuredCalendarId?: string) {
  const calendarId = encodeURIComponent(getCalendarId(configuredCalendarId))
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined

  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '2500',
    })
    if (syncToken) params.set('syncToken', syncToken)
    if (pageToken) params.set('pageToken', pageToken)

    const result = await googleRequestRaw(`/calendars/${calendarId}/events?${params.toString()}`)
    if (result.status === 410) {
      return { expired: true, events: [] as GoogleCalendarEvent[], nextSyncToken: null }
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Google Calendar ${result.status}: ${JSON.stringify(result.data)}`)
    }

    const data = result.data ?? {}
    events.push(...((data.items ?? []) as GoogleCalendarEvent[]))
    pageToken = data.nextPageToken
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken
  } while (pageToken)

  return { expired: false, events, nextSyncToken: nextSyncToken ?? null }
}

export async function watchCalendarEvents(input: {
  channelId: string
  token: string
  address?: string
  expirationMs?: number
  calendarId?: string
}) {
  const calendarId = encodeURIComponent(getCalendarId(input.calendarId))
  const expiration = input.expirationMs ?? (Date.now() + 6 * 24 * 60 * 60 * 1000)
  return await googleRequest(`/calendars/${calendarId}/events/watch`, {
    method: 'POST',
    body: JSON.stringify({
      id: input.channelId,
      type: 'web_hook',
      address: input.address ?? getCalendarWebhookUrl(),
      token: input.token,
      expiration,
    }),
  })
}

export async function stopCalendarWatch(channelId: string, resourceId: string) {
  const result = await googleRequestRaw('/channels/stop', {
    method: 'POST',
    body: JSON.stringify({ id: channelId, resourceId }),
  })
  if ([204, 404, 410].includes(result.status)) return null
  if (result.status >= 200 && result.status < 300) return result.data
  throw new Error(`Google Calendar ${result.status}: ${JSON.stringify(result.data)}`)
}
