import { json } from '../_shared/http.ts'
import { runCalendarSync, sha256Hex } from '../_shared/calendar-bidirectional.ts'
import { ensureCalendarWatchFresh } from '../_shared/calendar-watch.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const expected = Deno.env.get('CALENDAR_SYNC_SECRET') || ''
    const supplied = req.headers.get('x-calendar-sync-secret') || ''
    if (!expected || !supplied) return json({ error: 'Acesso não autorizado.' }, 401)

    const [expectedHash, suppliedHash] = await Promise.all([
      sha256Hex(expected),
      sha256Hex(supplied),
    ])
    if (expectedHash !== suppliedHash) return json({ error: 'Acesso não autorizado.' }, 401)

    // Daily incremental sync is a safety net in addition to Google push notifications.
    const sync = await runCalendarSync()
    const watch = await ensureCalendarWatchFresh(48)
    return json({ ok: true, sync, watch })
  } catch (error) {
    console.error('google_calendar_maintenance_error', error)
    return json({ error: 'Falha na manutenção da sincronização do calendário.' }, 500)
  }
})
