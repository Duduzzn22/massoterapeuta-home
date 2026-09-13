create or replace function private.current_user_can_access_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'admin'
  ) or exists (
    select 1
    from public.business_members bm
    where bm.user_id = auth.uid()
      and bm.business_id = target_business_id
      and bm.active = true
  );
$$;
revoke all on function private.current_user_can_access_business(uuid) from public, anon, authenticated;

