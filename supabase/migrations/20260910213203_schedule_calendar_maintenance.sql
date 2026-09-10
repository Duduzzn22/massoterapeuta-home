-- Keep Google Calendar push channels renewed and run a periodic safety sync.
-- The worker secret is generated inside Postgres, stored in Vault and compared
-- by hash inside the Edge Function. No plaintext credential is committed.

alter table private.integration_credentials enable row level security;

do $$
declare
  maintenance_secret text;
begin
  if not exists (
    select 1 from public.integration_runtime_secrets where id = 'calendar_maintenance'
  ) then
    select decrypted_secret
      into maintenance_secret
      from vault.decrypted_secrets
      where name = 'calendar_maintenance_secret'
      order by created_at desc
      limit 1;

    if maintenance_secret is null then
      maintenance_secret := encode(gen_random_bytes(32), 'hex');
      perform vault.create_secret(
        maintenance_secret,
        'calendar_maintenance_secret',
        'Google Calendar maintenance worker'
      );
    end if;

    insert into public.integration_runtime_secrets(id, secret_hash)
    values ('calendar_maintenance', encode(digest(maintenance_secret, 'sha256'), 'hex'));
  end if;
end $$;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'maintain-google-calendar'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'maintain-google-calendar',
  '17 */12 * * *',
  $cron$
  select net.http_post(
    url := 'https://nmjssxbneqepqonvcvoe.supabase.co/functions/v1/google-calendar-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-calendar-sync-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'calendar_maintenance_secret'
        order by created_at desc
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
