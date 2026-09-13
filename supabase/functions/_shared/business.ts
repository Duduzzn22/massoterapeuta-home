import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

export const DEFAULT_BUSINESS_SLUG = Deno.env.get('DEFAULT_BUSINESS_SLUG') || 'massoterapia-spa'

export type BusinessContext = {
  id: string
  organization_id: string
  name: string
  slug: string
  timezone: string
  phone_e164: string | null
  address_text: string | null
}

export async function resolveBusiness(
  supabase: SupabaseClient,
  selector?: { slug?: string | null; id?: string | null },
): Promise<BusinessContext | null> {
  let query = supabase
    .from('businesses')
    .select('id, organization_id, name, slug, timezone, phone_e164, address_text')
    .eq('active', true)

  if (selector?.id) query = query.eq('id', selector.id)
  else query = query.eq('slug', selector?.slug || DEFAULT_BUSINESS_SLUG)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as BusinessContext | null
}

export async function resolveBusinessFromWhatsAppPhoneNumber(
  supabase: SupabaseClient,
  phoneNumberId?: string | null,
): Promise<BusinessContext | null> {
  if (phoneNumberId) {
    const { data: phone, error: phoneError } = await supabase
      .from('whatsapp_phone_numbers')
      .select('business_id')
      .eq('phone_number_id', phoneNumberId)
      .eq('active', true)
      .maybeSingle()
    if (phoneError) throw phoneError
    if (phone?.business_id) return await resolveBusiness(supabase, { id: phone.business_id })
  }

  // Transitional fallback for the existing single-business test integration.
  return await resolveBusiness(supabase, { slug: DEFAULT_BUSINESS_SLUG })
}

export async function userCanAccessBusiness(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
) {
  const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from('profiles').select('role, active').eq('id', userId).maybeSingle(),
    supabase
      .from('business_members')
      .select('id, role, active')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .eq('active', true)
      .maybeSingle(),
  ])

  if (profileError) throw profileError
  if (membershipError) throw membershipError

  // Provider/global admins keep access during the migration; client staff use membership.
  return profile?.active === true && (profile.role === 'admin' || Boolean(membership?.id))
}
