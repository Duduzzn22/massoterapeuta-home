import { json } from '../_shared/http.ts'

// Mantido apenas para que o código versionado corresponda à função legada
// implantada. O bootstrap atual é feito pelo fluxo OAuth autenticado.
Deno.serve(() => json({
  error: 'Este endpoint foi desativado. Use o fluxo autenticado do Google Calendar.',
}, 410))
