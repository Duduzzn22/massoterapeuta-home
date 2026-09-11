import {
  consumeGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  storeGoogleRefreshToken,
  verifyConfiguredCalendarAccess,
} from '../_shared/google-oauth.ts'
import { createOrRenewCalendarWatch } from '../_shared/calendar-watch.ts'

function html(title: string, message: string, ok: boolean, status = 200) {
  const accent = ok ? '#2f7a46' : '#a23d31'
  const safeTitle = title.replace(/[<>]/g, '')
  const safeMessage = message.replace(/[<>]/g, '')
  return new Response(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${safeTitle}</title>
  <style>
    body{margin:0;background:#f5f1ec;color:#2e2925;font-family:Inter,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
    main{width:min(560px,100%);background:#fff;border:1px solid #e3dbd4;border-radius:20px;padding:32px;box-shadow:0 18px 50px rgb(53 35 24 / 10%)}
    .mark{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:${accent};color:#fff;font-size:24px;margin-bottom:18px}
    h1{font-size:1.7rem;margin:0 0 12px}p{line-height:1.65;color:#625a54;margin:0}small{display:block;margin-top:20px;color:#8a817a}
  </style>
</head>
<body><main><div class="mark">${ok ? '✓' : '!'}</div><h1>${safeTitle}</h1><p>${safeMessage}</p><small>Esta janela pode ser fechada com segurança.</small></main></body>
</html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') return html('Método não permitido', 'Use o fluxo de autorização iniciado pelo sistema.', false, 405)

  const url = new URL(req.url)
  const oauthError = url.searchParams.get('error')
  if (oauthError) return html('Autorização cancelada', 'O Google Calendar não foi conectado. Você pode tentar novamente quando quiser.', false, 400)

  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  if (!code || !state) return html('Retorno inválido', 'A resposta do Google não contém os dados necessários para concluir a autorização.', false, 400)

  try {
    const codeVerifier = await consumeGoogleOAuthState(state)
    const tokens = await exchangeGoogleAuthorizationCode(code, codeVerifier)
    await verifyConfiguredCalendarAccess(tokens.access_token)

    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token')
    }

    await storeGoogleRefreshToken(tokens.refresh_token)

    let activationMessage = 'A conta da Carla foi autorizada e o acesso ao calendário profissional foi salvo com segurança.'
    try {
      const result = await createOrRenewCalendarWatch({ forceFull: true })
      activationMessage += ` A sincronização bidirecional foi iniciada e o canal está ativo até ${new Date(result.expiresAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
    } catch (activationError) {
      console.error('google_calendar_activation_after_oauth_error', activationError)
      activationMessage += ' A autorização foi concluída, mas a ativação automática da sincronização precisará ser repetida pelo painel técnico.'
    }

    return html('Google Calendar conectado', activationMessage, true)
  } catch (error) {
    console.error('google_oauth_callback_error', error)
    return html('Não foi possível conectar o Google Calendar', 'Confira se a conta autorizada é a conta da Carla, se ela possui acesso à agenda configurada e tente novamente.', false, 500)
  }
})
