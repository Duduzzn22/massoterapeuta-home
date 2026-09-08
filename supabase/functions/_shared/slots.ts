import { Temporal } from 'npm:@js-temporal/polyfill@0.5.1'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

const TIME_ZONE = 'America/Sao_Paulo'

function parseTime(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  return { hour, minute }
}

export async function getAvailableSlots(
  supabase: SupabaseClient,
  date: string,
  serviceSlug: string,
) {
  const plainDate = Temporal.PlainDate.from(date)
  const weekday = plainDate.dayOfWeek % 7

  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('id, slug, name, duration_minutes')
    .eq('slug', serviceSlug)
    .eq('active', true)
    .maybeSingle()

  if (serviceError) throw serviceError
  if (!service) return { service: null, slots: [] }

  const { data: rules, error: rulesError } = await supabase
    .from('availability_rules')
    .select('start_time, end_time, slot_interval_minutes')
    .eq('weekday', weekday)
    .eq('active', true)
    .order('start_time')

  if (rulesError) throw rulesError
  if (!rules?.length) return { service, slots: [] }

  const dayStart = plainDate.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: '00:00' })
  const dayEnd = dayStart.add({ days: 1 })

  const [{ data: appointments, error: appointmentError }, { data: blocked, error: blockedError }] = await Promise.all([
    supabase
      .from('appointments')
      .select('starts_at, ends_at')
      .in('status', ['pending', 'confirmed'])
      .lt('starts_at', dayEnd.toInstant().toString())
      .gt('ends_at', dayStart.toInstant().toString()),
    supabase
      .from('blocked_periods')
      .select('starts_at, ends_at')
      .lt('starts_at', dayEnd.toInstant().toString())
      .gt('ends_at', dayStart.toInstant().toString()),
  ])

  if (appointmentError) throw appointmentError
  if (blockedError) throw blockedError

  const busy = [...(appointments ?? []), ...(blocked ?? [])].map((item) => ({
    start: Temporal.Instant.from(item.starts_at),
    end: Temporal.Instant.from(item.ends_at),
  }))

  const now = Temporal.Now.instant()
  const slots: Array<{ time: string; starts_at: string; ends_at: string }> = []

  for (const rule of rules) {
    const startParts = parseTime(rule.start_time)
    const endParts = parseTime(rule.end_time)

    let cursor = plainDate.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: Temporal.PlainTime.from(startParts) })
    const ruleEnd = plainDate.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: Temporal.PlainTime.from(endParts) })

    while (Temporal.ZonedDateTime.compare(cursor, ruleEnd) < 0) {
      const slotEnd = cursor.add({ minutes: service.duration_minutes })
      if (Temporal.ZonedDateTime.compare(slotEnd, ruleEnd) > 0) break

      const startInstant = cursor.toInstant()
      const endInstant = slotEnd.toInstant()
      const overlaps = busy.some((period) =>
        Temporal.Instant.compare(startInstant, period.end) < 0 &&
        Temporal.Instant.compare(endInstant, period.start) > 0
      )

      if (!overlaps && Temporal.Instant.compare(startInstant, now) > 0) {
        slots.push({
          time: `${String(cursor.hour).padStart(2, '0')}:${String(cursor.minute).padStart(2, '0')}`,
          starts_at: startInstant.toString(),
          ends_at: endInstant.toString(),
        })
      }

      cursor = cursor.add({ minutes: rule.slot_interval_minutes })
    }
  }

  return { service, slots }
}

export { TIME_ZONE }
