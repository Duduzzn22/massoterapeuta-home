const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

function env(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function accessToken() {
  const body = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    refresh_token: env('GOOGLE_REFRESH_TOKEN'),
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

async function googleRequest(path: string, init: RequestInit = {}) {
  const token = await accessToken()
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Google Calendar ${response.status}: ${JSON.stringify(data)}`)
  return data
}

export async function createCalendarEvent(input: {
  summary: string
  description?: string
  location?: string
  startsAt: string
  endsAt: string
}) {
  const calendarId = encodeURIComponent(env('GOOGLE_CALENDAR_ID'))
  return await googleRequest(`/calendars/${calendarId}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? '',
      location: input.location ?? '',
      start: { dateTime: input.startsAt, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: input.endsAt, timeZone: 'America/Sao_Paulo' },
      extendedProperties: { private: { source: 'massoterapeuta-home' } },
    }),
  })
}

export async function updateCalendarEvent(eventId: string, input: {
  summary: string
  description?: string
  location?: string
  startsAt: string
  endsAt: string
}) {
  const calendarId = encodeURIComponent(env('GOOGLE_CALENDAR_ID'))
  return await googleRequest(`/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? '',
      location: input.location ?? '',
      start: { dateTime: input.startsAt, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: input.endsAt, timeZone: 'America/Sao_Paulo' },
    }),
  })
}

export async function deleteCalendarEvent(eventId: string) {
  const calendarId = encodeURIComponent(env('GOOGLE_CALENDAR_ID'))
  return await googleRequest(`/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  })
}
