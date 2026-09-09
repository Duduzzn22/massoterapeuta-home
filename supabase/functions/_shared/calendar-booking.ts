import { createAdminClient } from './supabase.ts'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

function env(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function refreshToken() {
  const configured = Deno.env.get('GOOGLE_REFRESH_TOKEN')
  if (configured) return configured

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_google_refresh_token')
  if (error) throw new Error(`Unable to read Google refresh token: ${error.message}`)
  if (typeof data !== 'string' || !data) throw new Error('Google Calendar is not authorized yet')
  return data
}

async function accessToken() {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: await refreshToken(),
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth ${response.status}`)
  }
  return data.access_token as string
}

export async function createBookingCalendarEvent(input: {
  appointmentId: string
  clientName: string
  phone: string
  serviceName: string
  startsAt: string
  endsAt: string
  location: string
}) {
  const token = await accessToken()
  const calendarId = encodeURIComponent(env('GOOGLE_CALENDAR_ID'))
  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `${input.serviceName} — ${input.clientName}`,
      description: `Agendamento Massoterapeuta Home\nCliente: ${input.clientName}\nContato: ${input.phone}\nID: ${input.appointmentId}`,
      location: input.location,
      start: { dateTime: input.startsAt, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: input.endsAt, timeZone: 'America/Sao_Paulo' },
      extendedProperties: {
        private: {
          source: 'massoterapeuta-home',
          appointment_id: input.appointmentId,
        },
      },
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.id) {
    throw new Error(`Google Calendar create failed (${response.status})`)
  }

  return data as { id: string; etag?: string; updated?: string }
}
