import { createAdminClient } from '../_shared/supabase.ts'
import { json } from '../_shared/http.ts'
import { createBookingCalendarEvent } from '../_shared/calendar-booking.ts'
import { resolveBusiness } from '../_shared/business.ts'
import { sendWhatsApp, toWaRecipient } from '../_shared/whatsapp.ts'

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function errText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 700) : 'Unknown notification processing error'
}

function formatAppointmentDate(value: string, timeZone: string) {
  const date = new Date(value)
  return {
    date: new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date),
  }
}

async function markJobProcessed(supabase: ReturnType<typeof createAdminClient>, job: any) {
  const { error } = await supabase.from('notification_jobs').update({
    status: 'processed',
    processed_at: new Date().toISOString(),
    last_error: null,
  }).eq('business_id', job.business_id).eq('id', job.id)
  if (error) throw error
}

async function processWhatsAppConfirmation(
  supabase: ReturnType<typeof createAdminClient>,
  job: any,
  appointment: any,
) {
  const client = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients
  const service = Array.isArray(appointment.services) ? appointment.services[0] : appointment.services
  if (!client?.phone_e164 || !service?.name) throw new Error('Appointment contact or service is incomplete')

  const { data: template, error: templateError } = await supabase
    .from('message_templates')
    .select('name, language_code, body')
    .eq('business_id', appointment.business_id)
    .eq('name', 'agendamento_recebido')
    .eq('active', true)
    .ilike('status', 'approved')
    .maybeSingle()
  if (templateError) throw templateError
  if (!template) throw new Error('WhatsApp booking template is not approved')

  const { data: phoneConfig, error: phoneConfigError } = await supabase
    .from('whatsapp_phone_numbers')
    .select('phone_number_id')
    .eq('business_id', appointment.business_id)
    .eq('active', true)
    .eq('coexistence_enabled', true)
    .not('phone_number_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (phoneConfigError) throw phoneConfigError
  if (!phoneConfig?.phone_number_id) throw new Error('WhatsApp coexistence is not active')

  const { data: existing, error: existingError } = await supabase
    .from('whatsapp_messages')
    .select('id, status')
    .eq('notification_job_id', job.id)
    .maybeSingle()
  if (existingError) throw existingError

  if (existing && ['sent', 'delivered', 'read'].includes(existing.status)) {
    await markJobProcessed(supabase, job)
    return
  }

  const local = formatAppointmentDate(appointment.starts_at, appointment.business_timezone)
  const parameters = [client.full_name, service.name, local.date, local.time]
  const apiPayload = {
    to: toWaRecipient(client.phone_e164),
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language_code || 'pt_BR' },
      components: [{
        type: 'body',
        parameters: parameters.map((text) => ({ type: 'text', text })),
      }],
    },
  }

  const queuedMessage = {
    business_id: appointment.business_id,
    notification_job_id: job.id,
    client_id: appointment.client_id,
    direction: 'outbound',
    status: 'queued',
    message_type: 'template',
    template_name: template.name,
    body_preview: (template.body || 'Confirmação de solicitação de agendamento').slice(0, 500),
    payload: apiPayload,
    failure_reason: null,
    failed_at: null,
  }

  const { data: message, error: queueError } = await supabase
    .from('whatsapp_messages')
    .upsert(queuedMessage, { onConflict: 'notification_job_id' })
    .select('id')
    .single()
  if (queueError) throw queueError

  let metaMessageId: string
  try {
    const response = await sendWhatsApp(apiPayload, { phoneNumberId: phoneConfig.phone_number_id })
    metaMessageId = response?.messages?.[0]?.id ?? ''
    if (!metaMessageId) throw new Error('WhatsApp API did not return a message id')
  } catch (error) {
    await supabase.from('whatsapp_messages').update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      failure_reason: errText(error),
    }).eq('business_id', appointment.business_id).eq('id', message.id)
    throw error
  }

  const sentAt = new Date().toISOString()
  const { error: sentError } = await supabase.from('whatsapp_messages').update({
    meta_message_id: metaMessageId,
    status: 'sent',
    sent_at: sentAt,
  }).eq('business_id', appointment.business_id).eq('id', message.id)
  if (sentError) throw sentError

  await supabase.from('audit_logs').insert({
    business_id: appointment.business_id,
    action: 'whatsapp_booking_confirmation_sent',
    entity_type: 'appointment',
    entity_id: appointment.id,
    payload: { notification_job_id: job.id, meta_message_id: metaMessageId },
  })

  await markJobProcessed(supabase, job)
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
    const { data: jobs, error: claimError } = await supabase.rpc('claim_notification_jobs', { p_limit: 10 })
    if (claimError) throw claimError

    let processed = 0
    let retried = 0
    let failed = 0

    for (const job of jobs ?? []) {
      try {
        const { data: appointment, error: appointmentError } = await supabase
          .from('appointments')
          .select(`
            id, business_id, client_id, status, starts_at, ends_at, location_type, home_city, home_neighborhood,
            google_event_id,
            clients!inner(full_name, phone_e164),
            services!inner(name)
          `)
          .eq('business_id', job.business_id)
          .eq('id', job.appointment_id)
          .maybeSingle()
        if (appointmentError) throw appointmentError

        if (!appointment || appointment.status === 'cancelled') {
          await markJobProcessed(supabase, job)
          processed += 1
          continue
        }

        const business = await resolveBusiness(supabase, { id: appointment.business_id })
        if (!business) throw new Error('Business not found for notification job')

        if (job.job_type === 'whatsapp_booking_confirmation') {
          await processWhatsAppConfirmation(supabase, job, {
            ...appointment,
            business_timezone: business.timezone,
          })
          processed += 1
          continue
        }

        if (appointment.google_event_id) {
          await markJobProcessed(supabase, job)
          processed += 1
          continue
        }

        const client = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients
        const service = Array.isArray(appointment.services) ? appointment.services[0] : appointment.services
        const { data: calendarState, error: calendarStateError } = await supabase
          .from('calendar_sync_state')
          .select('calendar_id')
          .eq('business_id', business.id)
          .maybeSingle()
        if (calendarStateError) throw calendarStateError
        if (!calendarState?.calendar_id) throw new Error('Google Calendar is not connected for this business')
        const location = appointment.location_type === 'home_care'
          ? `Home care — ${appointment.home_neighborhood ?? ''}, ${appointment.home_city ?? ''}`
          : (business.address_text || business.name)

        const googleEvent = await createBookingCalendarEvent({
          appointmentId: appointment.id,
          businessId: business.id,
          businessName: business.name,
          clientName: client?.full_name ?? 'Cliente',
          phone: client?.phone_e164 ?? '',
          serviceName: service?.name ?? 'Sessão',
          startsAt: appointment.starts_at,
          endsAt: appointment.ends_at,
          location,
          calendarId: calendarState.calendar_id,
          timeZone: business.timezone,
        })

        const now = new Date().toISOString()
        const { error: updateError } = await supabase.from('appointments').update({
          google_event_id: googleEvent.id,
          google_event_etag: googleEvent.etag ?? null,
          google_event_updated_at: googleEvent.updated ?? null,
          google_last_synced_at: now,
          updated_at: now,
        }).eq('business_id', business.id).eq('id', appointment.id)
        if (updateError) throw updateError

        await supabase.from('appointment_events').insert({
          business_id: business.id,
          appointment_id: appointment.id,
          event_type: 'google_calendar_created_retry',
          payload: { google_event_id: googleEvent.id },
        })

        await markJobProcessed(supabase, job)
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
        }).eq('business_id', job.business_id).eq('id', job.id)

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
