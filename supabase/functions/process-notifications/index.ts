import { createAdminClient } from '../_shared/supabase.ts'
import { json } from '../_shared/http.ts'
import { createBookingCalendarEvent } from '../_shared/calendar-booking.ts'

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function errText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 700) : 'Unknown notification processing error'
}

async function authorized(req: Request, supabase: ReturnType<typeof createAdminClient>) {
  const supplied = req.headers.get('x-worker-secret') || ''
  if (!supplied) return false

  const { data, error } = await supabase
    .from('integration_runtime_secrets')
    .select('secret_hash')
    .eq('id', 'notification_worker')
    .maybeSingle()
  if (error || !data?.secret_hash) return false

  return await sha256Hex(supplied) === data.secret_hash
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const supabase = createAdminClient()
  if (!(await authorized(req, supabase))) return json({ error: 'Acesso não autorizado.' }, 401)

  try {
    const { data: jobs, error: claimError } = await supabase.rpc('claim_google_calendar_jobs', { p_limit: 10 })
    if (claimError) throw claimError

    let processed = 0
    let retried = 0
    let failed = 0

    for (const job of jobs ?? []) {
      try {
        const { data: appointment, error: appointmentError } = await supabase
          .from('appointments')
          .select(`
            id, status, starts_at, ends_at, location_type, home_city, home_neighborhood,
            google_event_id,
            clients!inner(full_name, phone_e164),
            services!inner(name)
          `)
          .eq('id', job.appointment_id)
          .maybeSingle()
        if (appointmentError) throw appointmentError

        if (!appointment || appointment.status === 'cancelled') {
          await supabase.from('notification_jobs').update({
            status: 'processed',
            processed_at: new Date().toISOString(),
            last_error: null,
          }).eq('id', job.id)
          processed += 1
          continue
        }

        if (appointment.google_event_id) {
          await supabase.from('notification_jobs').update({
            status: 'processed',
            processed_at: new Date().toISOString(),
            last_error: null,
          }).eq('id', job.id)
          processed += 1
          continue
        }

        const client = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients
        const service = Array.isArray(appointment.services) ? appointment.services[0] : appointment.services
        const location = appointment.location_type === 'home_care'
          ? `Home care — ${appointment.home_neighborhood ?? ''}, ${appointment.home_city ?? ''}`
          : 'Spa Carla Lira — R. Samuel Fragoso Coimbra, 483, Valinhos - SP'

        const googleEvent = await createBookingCalendarEvent({
          appointmentId: appointment.id,
          clientName: client?.full_name ?? 'Cliente',
          phone: client?.phone_e164 ?? '',
          serviceName: service?.name ?? 'Sessão',
          startsAt: appointment.starts_at,
          endsAt: appointment.ends_at,
          location,
        })

        const now = new Date().toISOString()
        const { error: updateError } = await supabase.from('appointments').update({
          google_event_id: googleEvent.id,
          google_event_etag: googleEvent.etag ?? null,
          google_event_updated_at: googleEvent.updated ?? null,
          google_last_synced_at: now,
          updated_at: now,
        }).eq('id', appointment.id)
        if (updateError) throw updateError

        await supabase.from('appointment_events').insert({
          appointment_id: appointment.id,
          event_type: 'google_calendar_created_retry',
          payload: { google_event_id: googleEvent.id },
        })

        await supabase.from('notification_jobs').update({
          status: 'processed',
          processed_at: now,
          last_error: null,
        }).eq('id', job.id)
        processed += 1
      } catch (error) {
        const attempts = Number(job.attempts ?? 1)
        const terminal = attempts >= 5
        const delayMinutes = Math.min(60, Math.max(2, 2 ** attempts))

        await supabase.from('notification_jobs').update({
          status: terminal ? 'failed' : 'pending',
          scheduled_for: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          last_error: errText(error),
          ...(terminal ? { processed_at: new Date().toISOString() } : {}),
        }).eq('id', job.id)

        if (terminal) failed += 1
        else retried += 1
      }
    }

    return json({ ok: true, claimed: (jobs ?? []).length, processed, retried, failed })
  } catch (error) {
    console.error('process_notifications_error', error)
    return json({ error: 'Falha ao processar a fila de notificações.' }, 500)
  }
})
