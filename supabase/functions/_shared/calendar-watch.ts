import { createAdminClient } from './supabase.ts'
import { runCalendarSync, sha256Hex } from './calendar-bidirectional.ts'
import { getCalendarId, stopCalendarWatch, watchCalendarEvents } from './google-calendar.ts'

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function getCalendarSyncState() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('calendar_sync_state')
    .select('*')
    .eq('singleton_id', 1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createOrRenewCalendarWatch(options: { forceFull?: boolean } = {}) {
  const syncResult = await runCalendarSync({ forceFull: options.forceFull === true })
  const supabase = createAdminClient()
  const { data: previous, error: stateError } = await supabase
    .from('calendar_sync_state')
    .select('*')
    .eq('singleton_id', 1)
    .single()
  if (stateError) throw stateError

  const channelId = crypto.randomUUID()
  const channelToken = randomToken()
  const tokenHash = await sha256Hex(channelToken)
  const requestedExpiration = Date.now() + 6 * 24 * 60 * 60 * 1000
  const watch = await watchCalendarEvents({
    channelId,
    token: channelToken,
    expirationMs: requestedExpiration,
  })

  const expirationMs = Number(watch?.expiration || requestedExpiration)
  const expiresAt = new Date(expirationMs).toISOString()
  const now = new Date().toISOString()

  const { error: updateError } = await supabase.from('calendar_sync_state').update({
    calendar_id: getCalendarId(),
    watch_channel_id: channelId,
    watch_resource_id: watch?.resourceId ?? null,
    watch_token_hash: tokenHash,
    watch_expires_at: expiresAt,
    last_message_number: null,
    last_error: null,
    updated_at: now,
  }).eq('singleton_id', 1)
  if (updateError) throw updateError

  // Google recommends allowing a short overlap when replacing notification channels.
  if (previous?.watch_channel_id && previous?.watch_resource_id) {
    try {
      await stopCalendarWatch(previous.watch_channel_id, previous.watch_resource_id)
    } catch (error) {
      console.warn('old_calendar_watch_stop_failed', error)
    }
  }

  return {
    sync: syncResult,
    channelId,
    resourceId: watch?.resourceId ?? null,
    expiresAt,
  }
}

export async function stopStoredCalendarWatch() {
  const supabase = createAdminClient()
  const { data: state, error } = await supabase
    .from('calendar_sync_state')
    .select('*')
    .eq('singleton_id', 1)
    .maybeSingle()
  if (error) throw error

  if (state?.watch_channel_id && state?.watch_resource_id) {
    await stopCalendarWatch(state.watch_channel_id, state.watch_resource_id)
  }

  if (state) {
    const { error: clearError } = await supabase.from('calendar_sync_state').update({
      watch_channel_id: null,
      watch_resource_id: null,
      watch_token_hash: null,
      watch_expires_at: null,
      last_message_number: null,
      updated_at: new Date().toISOString(),
    }).eq('singleton_id', 1)
    if (clearError) throw clearError
  }

  return { stopped: true }
}

export async function ensureCalendarWatchFresh(maxAgeHours = 48) {
  const state = await getCalendarSyncState()
  if (!state?.watch_expires_at) return await createOrRenewCalendarWatch()

  const expiresAt = new Date(state.watch_expires_at).getTime()
  const renewBefore = Date.now() + maxAgeHours * 60 * 60 * 1000
  if (!Number.isFinite(expiresAt) || expiresAt <= renewBefore) {
    return await createOrRenewCalendarWatch()
  }

  return {
    renewed: false,
    channelId: state.watch_channel_id,
    expiresAt: state.watch_expires_at,
  }
}
