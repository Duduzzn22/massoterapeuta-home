import { requireAdmin } from '../_shared/auth.ts'
import { handleOptions, json } from '../_shared/http.ts'
import { createOrRenewCalendarWatch, getCalendarSyncState, stopStoredCalendarWatch } from '../_shared/calendar-watch.ts'
import { runCalendarSync } from '../_shared/calendar-bidirectional.ts'

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const auth = await requireAdmin(req)
    if (!auth) return json({ error: 'Acesso não autorizado.' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = typeof body?.action === 'string' ? body.action : 'status'

    if (action === 'status') {
      return json({ ok: true, state: await getCalendarSyncState() })
    }

    if (action === 'sync') {
      const result = await runCalendarSync({ forceFull: body?.force_full === true })
      return json({ ok: true, result })
    }

    if (action === 'stop') {
      return json({ ok: true, result: await stopStoredCalendarWatch() })
    }

    if (action === 'start' || action === 'renew') {
      const result = await createOrRenewCalendarWatch({ forceFull: body?.force_full === true })
      return json({ ok: true, result })
    }

    return json({ error: 'Ação inválida. Use status, sync, start, renew ou stop.' }, 400)
  } catch (error) {
    console.error('google_calendar_watch_error', error)
    return json({ error: 'Não foi possível configurar a sincronização do Google Calendar.' }, 500)
  }
})
