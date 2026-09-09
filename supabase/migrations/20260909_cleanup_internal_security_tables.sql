drop table if exists public.calendar_bootstrap_tokens;

drop policy if exists "internal_no_direct_access" on public.google_oauth_states;
create policy "internal_no_direct_access" on public.google_oauth_states
for all to anon, authenticated
using (false)
with check (false);

drop policy if exists "internal_no_direct_access" on public.integration_runtime_secrets;
create policy "internal_no_direct_access" on public.integration_runtime_secrets
for all to anon, authenticated
using (false)
with check (false);
