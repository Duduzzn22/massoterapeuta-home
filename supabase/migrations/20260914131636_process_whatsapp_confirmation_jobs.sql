alter table public.whatsapp_messages
  add column if not exists notification_job_id uuid
  references public.notification_jobs(id) on delete set null;

create unique index if not exists whatsapp_messages_notification_job_id_key
  on public.whatsapp_messages(notification_job_id)
  where notification_job_id is not null;

create or replace function public.claim_notification_jobs(p_limit integer default 10)
returns setof public.notification_jobs
language sql
security definer
set search_path = ''
as $$
  with picked as (
    select j.id
    from public.notification_jobs j
    where j.status = 'pending'
      and j.scheduled_for <= now()
      and (
        j.job_type = 'google_calendar_create'
        or (
          j.job_type = 'whatsapp_booking_confirmation'
          and exists (
            select 1
            from public.message_templates mt
            where mt.business_id = j.business_id
              and mt.name = 'agendamento_recebido'
              and mt.active
              and lower(mt.status) = 'approved'
          )
          and exists (
            select 1
            from public.whatsapp_phone_numbers wpn
            where wpn.business_id = j.business_id
              and wpn.active
              and wpn.coexistence_enabled
              and wpn.phone_number_id is not null
          )
        )
      )
    order by j.scheduled_for, j.created_at
    for update of j skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.notification_jobs j
  set status = 'processing',
      attempts = j.attempts + 1
  from picked
  where j.id = picked.id
  returning j.*;
$$;

revoke all on function public.claim_notification_jobs(integer) from public;
revoke all on function public.claim_notification_jobs(integer) from anon;
revoke all on function public.claim_notification_jobs(integer) from authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;
