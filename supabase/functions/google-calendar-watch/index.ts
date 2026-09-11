import { requireAdmin } from '../_shared/auth.ts'
import { handleOptions, json } from '../_shared/http.ts'
import { createOrRenewCalendarWatch, getCalendarSyncState, stopStoredCalendarWatch } from '../_shared/calendar-watch.ts'
import { runCalendarSync } from '../_shared/calendar-bidirectional.ts'
import { resolveBusiness, userCanAccessBusiness } from '../_shared/business.ts'

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const auth = await requireAdmin(req)
    if (!auth) return json({ error: 'Acesso não autorizado.' }, 403)

    const body = await req.json().catch(() => ({}))
    const business = await resolveBusiness(auth.supabase, {
      id: typeof body?.business_id === 'string' ? body.business_id : null,
      slug: typeof body?.business_slug === 'string' ? body.business_slug : null,
    })
    if (!business || !(await userCanAccessBusiness(auth.supabase, auth.user.id, business.id))) {
      return json({ error: 'Empresa não encontrada ou acesso negado.' }, 403)
    }
    const action = typeof body?.action === 'string' ? body.action : 'status'

    if (action === 'status') {
      return json({ ok: true, state: await getCalendarSyncState(business.id) })
    }

    if (action === 'sync') {
      const result = await runCalendarSync({ forceFull: body?.force_full === true, businessId: business.id })
      return json({ ok: true, result })
    }

    if (action === 'stop') {
      return json({ ok: true, result: await stopStoredCalendarWatch(business.id) })
    }

    if (action === 'start' || action === 'renew') {
      const result = await createOrRenewCalendarWatch({ forceFull: body?.force_full === true, businessId: business.id })
      return json({ ok: true, result })
    }

    return json({ error: 'Ação inválida. Use status, sync, start, renew ou stop.' }, 400)
  } catch (error) {
    console.error('google_calendar_watch_error', error)
    return json({ error: 'Não foi possível configurar a sincronização do Google Calendar.' }, 500)
  }
})
