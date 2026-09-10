create extension if not exists pg_cron with schema extensions;

create table if not exists public.integration_runtime_secrets (
  id text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integration_runtime_secrets enable row level security;
revoke all on public.integration_runtime_secrets from anon;
revoke all on public.integration_runtime_secrets from authenticated;
grant select on public.integration_runtime_secrets to service_role;

create or replace function public.claim_google_calendar_jobs(p_limit integer default 10)
returns setof public.notification_jobs
language sql
security definer
set search_path = ''
as $$
  with picked as (
    select id
    from public.notification_jobs
    where status = 'pending'
      and job_type = 'google_calendar_create'
      and scheduled_for <= now()
    order by scheduled_for, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.notification_jobs j
  set status = 'processing',
      attempts = j.attempts + 1
  from picked
  where j.id = picked.id
  returning j.*;
$$;

revoke all on function public.claim_google_calendar_jobs(integer) from public;
revoke all on function public.claim_google_calendar_jobs(integer) from anon;
revoke all on function public.claim_google_calendar_jobs(integer) from authenticated;
grant execute on function public.claim_google_calendar_jobs(integer) to service_role;

do $$
declare
  worker_secret text;
begin
  if not exists (
    select 1 from public.integration_runtime_secrets where id = 'notification_worker'
  ) then
    worker_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(worker_secret, 'notification_worker_secret', 'Massoterapia notification worker');
    insert into public.integration_runtime_secrets(id, secret_hash)
    values ('notification_worker', encode(digest(worker_secret, 'sha256'), 'hex'));
  end if;
end $$;

