import { beginGoogleOAuth } from '../_shared/google-oauth.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Método não permitido.', { status: 405, headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const authorizationUrl = await beginGoogleOAuth()
    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizationUrl,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    console.error('google_oauth_start_error', error)
    return new Response('Não foi possível iniciar a autorização do Google Calendar.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
})
