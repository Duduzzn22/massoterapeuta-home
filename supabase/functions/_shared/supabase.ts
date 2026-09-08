import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

function getSecretKey() {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modern) {
    const parsed = JSON.parse(modern)
    const key = parsed.default ?? Object.values(parsed)[0]
    if (typeof key === 'string' && key) return key
  }

  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy

  throw new Error('Supabase secret key is not available')
}

export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new Error('SUPABASE_URL is not available')

  return createClient(url, getSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
