import { createAdminClient } from './supabase.ts'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

// Strip markup-ish characters and collapse whitespace so the description
// is safe if copy-pasted into any innerHTML-rendering surface downstream.
// 120-char cap on summary line keeps the string manageable and matches
// the limit already applied to names on the booking form.
function sanitizeCalendarField(value: string, maxLen = 500): string {
  return String(value ?? '')
    .replace(/[<>&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

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
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth ${response.status}`)
  return data.access_token as string
}

export async function createBookingCalendarEvent(input: {
  appointmentId: string
  businessId: string
  businessName: string
  clientName: string
  phone: string
  serviceName: string
  startsAt: string
  endsAt: string
  location: string
  calendarId: string
  timeZone: string
}) {
  const token = await accessToken()
  const calendarId = encodeURIComponent(input.calendarId)
  const businessName = sanitizeCalendarField(input.businessName, 120)
  const clientName = sanitizeCalendarField(input.clientName, 120)
  const serviceName = sanitizeCalendarField(input.serviceName, 120)
  const phone = sanitizeCalendarField(input.phone, 32)
  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `${serviceName} — ${clientName}`,
      description: `Agendamento ${businessName}\nCliente: ${clientName}\nContato: ${phone}\nID: ${input.appointmentId}`,
      location: input.location,
      start: { dateTime: input.startsAt, timeZone: input.timeZone },
      end: { dateTime: input.endsAt, timeZone: input.timeZone },
      extendedProperties: {
        private: {
          source: 'massoterapeuta-home',
          appointment_id: input.appointmentId,
          business_id: input.businessId,
        },
      },
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.id) throw new Error(`Google Calendar create failed (${response.status})`)
  return data as { id: string; etag?: string; updated?: string }
}
