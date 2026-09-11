import { json } from '../_shared/http.ts'
import { runCalendarSync, sha256Hex } from '../_shared/calendar-bidirectional.ts'
import { ensureCalendarWatchFresh } from '../_shared/calendar-watch.ts'
import { createAdminClient } from '../_shared/supabase.ts'

async function authorized(req: Request, supabase: ReturnType<typeof createAdminClient>) {
  const supplied = req.headers.get('x-calendar-sync-secret') || ''
  if (!supplied) return false

  const { data, error } = await supabase
    .from('integration_runtime_secrets')
    .select('secret_hash')
    .eq('id', 'calendar_maintenance')
    .maybeSingle()
  if (error || !data?.secret_hash) return false
  return await sha256Hex(supplied) === data.secret_hash
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const supabase = createAdminClient()
    if (!(await authorized(req, supabase))) return json({ error: 'Acesso não autorizado.' }, 401)

    const { data: states, error } = await supabase
      .from('calendar_sync_state')
      .select('business_id')
      .not('calendar_id', 'is', null)
    if (error) throw error

    const results = []
    for (const state of states ?? []) {
      try {
        const sync = await runCalendarSync({ businessId: state.business_id })
        const watch = await ensureCalendarWatchFresh(state.business_id, 48)
        results.push({ business_id: state.business_id, ok: true, sync, watch })
      } catch (error) {
        results.push({
          business_id: state.business_id,
          ok: false,
          error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown calendar maintenance error',
        })
      }
    }

    return json({ ok: results.every((result) => result.ok), processed: results.length, results }, results.every((result) => result.ok) ? 200 : 500)
  } catch (error) {
    console.error('google_calendar_maintenance_error', error)
    return json({ error: 'Falha na manutenção da sincronização do calendário.' }, 500)
  }
})
