// Rules that decide whether a queued notification is still worth sending.
// Pure functions (no Deno/Supabase imports) so they can be unit-tested with
// Node — see tests/notification-rules.test.mjs.

// Keep in sync with public.whatsapp_confirmation_window() in
// supabase/migrations/20261023230000_expire_stale_whatsapp_confirmations.sql
export const WHATSAPP_CONFIRMATION_MAX_AGE_MS = 24 * 60 * 60 * 1000

const ACTIVE_APPOINTMENT_STATUSES = new Set(['pending', 'confirmed'])

type JobLike = { created_at?: string | null }
type AppointmentLike = { status?: string | null; starts_at?: string | null } | null | undefined

/**
 * Returns why a WhatsApp booking confirmation must NOT be sent, or null when
 * it is still timely. A "we received your booking" message only makes sense
 * shortly after the booking and before the session.
 */
export function whatsappConfirmationSkipReason(
  job: JobLike,
  appointment: AppointmentLike,
  now: Date = new Date(),
): string | null {
  if (!appointment) return 'appointment_missing'

  const status = String(appointment.status ?? '')
  if (!ACTIVE_APPOINTMENT_STATUSES.has(status)) return `appointment_${status || 'unknown'}`

  const startsAt = appointment.starts_at ? Date.parse(appointment.starts_at) : NaN
  if (!Number.isFinite(startsAt) || startsAt <= now.getTime()) return 'appointment_already_started'

  const createdAt = job.created_at ? Date.parse(job.created_at) : NaN
  if (!Number.isFinite(createdAt) || now.getTime() - createdAt > WHATSAPP_CONFIRMATION_MAX_AGE_MS) {
    return 'confirmation_window_expired'
  }

  return null
}
