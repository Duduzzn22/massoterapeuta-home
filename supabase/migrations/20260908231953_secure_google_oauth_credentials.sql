create table if not exists public.google_oauth_states (
  state_hash text primary key,
  code_verifier text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at)
);

alter table public.google_oauth_states enable row level security;
revoke all on public.google_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.google_oauth_states to service_role;
create index if not exists idx_google_oauth_states_expires_at on public.google_oauth_states(expires_at);

create schema if not exists private;
create table if not exists private.integration_credentials (
  provider text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.integration_credentials from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function public.set_google_refresh_token(p_refresh_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_refresh_token is null or length(p_refresh_token) < 20 then
    raise exception 'Invalid refresh token';
  end if;

  insert into private.integration_credentials(provider, secret_value, updated_at)
  values ('google_calendar', p_refresh_token, now())
  on conflict (provider) do update
    set secret_value = excluded.secret_value,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_google_refresh_token()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select secret_value
  from private.integration_credentials
  where provider = 'google_calendar'
  limit 1;
$$;

revoke all on function public.set_google_refresh_token(text) from public, anon, authenticated;
revoke all on function public.get_google_refresh_token() from public, anon, authenticated;
grant execute on function public.set_google_refresh_token(text) to service_role;
grant execute on function public.get_google_refresh_token() to service_role;

