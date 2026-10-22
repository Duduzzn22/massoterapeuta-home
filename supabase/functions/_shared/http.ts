const DEFAULT_ALLOWED_ORIGINS = [
  'https://massoterapeuta-home.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]

const WILDCARD_PREVIEW_SUFFIX = '.vercel.app'

function parseAllowedOrigins() {
  const configured = Deno.env.get('ALLOWED_ORIGINS')
  if (!configured) return DEFAULT_ALLOWED_ORIGINS
  return configured.split(',').map((origin) => origin.trim()).filter(Boolean)
}

function isAllowedOrigin(origin: string, allowList: string[]) {
  if (allowList.includes(origin)) return true
  // Preview deployments on Vercel: https://<branch>-<project>.vercel.app
  if (origin.endsWith(WILDCARD_PREVIEW_SUFFIX) && origin.startsWith('https://')) return true
  return false
}

export function resolveCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowList = parseAllowedOrigins()
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (origin && isAllowedOrigin(origin, allowList)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

export function json(data: unknown, status = 200, req?: Request) {
  const cors = req ? resolveCorsHeaders(req) : {}
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') {
    const cors = resolveCorsHeaders(req)
    if (!cors['Access-Control-Allow-Origin']) {
      return new Response(null, { status: 403, headers: cors })
    }
    return new Response('ok', { headers: cors })
  }
  return null
}

export function cleanText(value: unknown, max = 500) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function normalizeBrazilPhone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return `+${digits}`
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`
  return null
}
