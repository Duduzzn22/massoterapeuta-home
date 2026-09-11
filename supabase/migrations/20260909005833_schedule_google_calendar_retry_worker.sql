do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'process-google-calendar-jobs'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'process-google-calendar-jobs',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://nmjssxbneqepqonvcvoe.supabase.co/functions/v1/process-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'notification_worker_secret'
        order by created_at desc
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

