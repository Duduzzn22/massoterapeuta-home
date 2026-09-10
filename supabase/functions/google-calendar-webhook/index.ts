import { createAdminClient } from '../_shared/supabase.ts'
import { json } from '../_shared/http.ts'
import { runCalendarSync, sha256Hex } from '../_shared/calendar-bidirectional.ts'

function numberHeader(req: Request, name: string) {
  const value = req.headers.get(name)
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const channelId = req.headers.get('x-goog-channel-id') || ''
  const channelToken = req.headers.get('x-goog-channel-token') || ''
  const resourceId = req.headers.get('x-goog-resource-id') || ''
  const resourceState = req.headers.get('x-goog-resource-state') || ''
  const messageNumber = numberHeader(req, 'x-goog-message-number')

  if (!channelId || !channelToken || !resourceId) {
    return new Response(null, { status: 204 })
  }

  const supabase = createAdminClient()

  try {
    const { data: state, error } = await supabase
      .from('calendar_sync_state')
      .select('*')
      .eq('watch_channel_id', channelId)
      .maybeSingle()
    if (error) throw error

    // Old/unknown channels are intentionally acknowledged and ignored.
    if (!state) return new Response(null, { status: 204 })
    if (state.watch_resource_id && state.watch_resource_id !== resourceId) {
      return new Response(null, { status: 204 })
    }

    const incomingHash = await sha256Hex(channelToken)
    if (!state.watch_token_hash || incomingHash !== state.watch_token_hash) {
      console.warn('google_calendar_webhook_token_mismatch')
      return new Response(null, { status: 204 })
    }

    if (
      messageNumber !== null &&
      state.last_message_number !== null &&
      messageNumber <= Number(state.last_message_number)
    ) {
      return new Response(null, { status: 204 })
    }

    const now = new Date().toISOString()
    const { error: markError } = await supabase.from('calendar_sync_state').update({
      last_notification_at: now,
      ...(messageNumber !== null ? { last_message_number: messageNumber } : {}),
      updated_at: now,
    }).eq('business_id', state.business_id)
    if (markError) throw markError

    // The first notification only confirms that the channel is active.
    if (resourceState === 'sync') return new Response(null, { status: 204 })

    await runCalendarSync({ businessId: state.business_id })
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error('google_calendar_webhook_error', error)
    // Google retries 5xx push deliveries with backoff.
    return new Response(null, { status: 500 })
  }
})
