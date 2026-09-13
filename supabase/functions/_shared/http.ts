export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
