-- Expire stale WhatsApp booking confirmations.
--
-- Problem: while the WhatsApp Cloud API is not configured (no approved
-- 'agendamento_recebido' template / no coexistence phone number),
-- claim_notification_jobs never picks 'whatsapp_booking_confirmation' jobs,
-- so they pile up as 'pending' forever. The moment the integration is
-- activated, the worker would send every one of them at once — including
-- "we received your booking" messages for sessions that already happened,
-- were cancelled, or were booked weeks ago.
--
-- Fix:
--   1. A confirmation is only worth sending while it is still timely:
--      the appointment is pending/confirmed, has not started yet, and the
--      job was created within the confirmation window (24h).
--   2. Stale jobs are marked 'skipped' (with the reason in last_error)
--      every time the worker claims jobs, so the queue never accumulates.
--   3. The claim only returns confirmations that are still timely.
--   4. The current backlog is expired right now, when this migration runs.
--
-- The edge function process-notifications applies the same rule before
-- sending (see supabase/functions/_shared/notification-rules.ts); keep the
-- window in sync with WHATSAPP_CONFIRMATION_MAX_AGE_MS there.

create or replace function public.whatsapp_confirmation_window()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '24 hours' $$;

create or replace function public.expire_stale_notification_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  with stale as (
    select
      j.id,
      case
        when a.id is null then 'appointment_missing'
        when a.status not in ('pending', 'confirmed') then 'appointment_' || a.status::text
        when a.starts_at <= now() then 'appointment_already_started'
        else 'confirmation_window_expired'
      end as reason
    from public.notification_jobs j
    left join public.appointments a
      on a.id = j.appointment_id
     and a.business_id = j.business_id
    where j.job_type = 'whatsapp_booking_confirmation'
      and j.status = 'pending'
      and (
        a.id is null
        or a.status not in ('pending', 'confirmed')
        or a.starts_at <= now()
        or j.created_at < now() - public.whatsapp_confirmation_window()
      )
    for update of j skip locked
  )
  update public.notification_jobs j
  set status = 'skipped',
      processed_at = now(),
      last_error = 'skipped: ' || stale.reason
  from stale
  where j.id = stale.id;

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.expire_stale_notification_jobs() from public;
revoke all on function public.expire_stale_notification_jobs() from anon;
revoke all on function public.expire_stale_notification_jobs() from authenticated;
grant execute on function public.expire_stale_notification_jobs() to service_role;

-- Same signature/return type as before, now plpgsql so it can expire stale
-- jobs first. Google Calendar jobs are unchanged.
create or replace function public.claim_notification_jobs(p_limit integer default 10)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_stale_notification_jobs();

  return query
  with picked as (
    select j.id
    from public.notification_jobs j
    where j.status = 'pending'
      and j.scheduled_for <= now()
      and (
        j.job_type = 'google_calendar_create'
        or (
          j.job_type = 'whatsapp_booking_confirmation'
          and j.created_at >= now() - public.whatsapp_confirmation_window()
          and exists (
            select 1
            from public.appointments a
            where a.id = j.appointment_id
              and a.business_id = j.business_id
              and a.status in ('pending', 'confirmed')
              and a.starts_at > now()
          )
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
  ),
  claimed as (
    update public.notification_jobs j
    set status = 'processing',
        attempts = j.attempts + 1
    from picked
    where j.id = picked.id
    returning j.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_notification_jobs(integer) from public;
revoke all on function public.claim_notification_jobs(integer) from anon;
revoke all on function public.claim_notification_jobs(integer) from authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;

-- Clear the backlog accumulated so far.
select public.expire_stale_notification_jobs();
