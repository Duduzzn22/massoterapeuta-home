create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter extension btree_gist set schema extensions;

alter function public.default_business_id() set schema private;
alter function public.user_can_access_business(uuid) set schema private;

revoke all on function private.default_business_id() from public, anon;
revoke all on function private.user_can_access_business(uuid) from public, anon;
grant execute on function private.default_business_id() to authenticated, service_role;
grant execute on function private.user_can_access_business(uuid) to authenticated, service_role;
