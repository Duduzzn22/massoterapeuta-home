import { createAdminClient } from './supabase.ts'

export async function requireAdmin(req: Request) {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null

  const supabase = createAdminClient()
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, active')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError || !profile || !profile.active || profile.role !== 'admin') return null
  return { user: userData.user, profile, supabase }
}
