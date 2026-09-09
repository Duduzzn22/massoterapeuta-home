-- Runtime hardening after the multi-tenant foundation.
-- External account IDs/tokens are intentionally not hardcoded here.

create index if not exists idx_clients_business_id on public.clients(business_id);
create index if not exists idx_appointments_business_id on public.appointments(business_id);
create index if not exists idx_services_business_id on public.services(business_id);
create index if not exists idx_availability_rules_business_id on public.availability_rules(business_id);
create index if not exists idx_blocked_periods_business_id on public.blocked_periods(business_id);
create index if not exists idx_whatsapp_messages_business_id on public.whatsapp_messages(business_id);
create index if not exists idx_whatsapp_conversations_business_id on public.whatsapp_conversations(business_id);
create index if not exists idx_notification_jobs_business_id on public.notification_jobs(business_id);

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

revoke all on function private.current_user_can_access_business(uuid)
  from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'appointment_events','appointments','audit_logs','availability_rules','blocked_periods',
    'calendar_sync_state','campaign_recipients','campaigns','client_consents','clients',
    'message_templates','notification_jobs','quick_replies','service_packages','services',
    'whatsapp_contacts','whatsapp_conversations','whatsapp_messages'
  ]
  loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('drop policy if exists tenant_access on public.%I', t);
    execute format(
      'create policy tenant_access on public.%I for all to authenticated using (private.current_user_can_access_business(business_id)) with check (private.current_user_can_access_business(business_id))',
      t
    );
  end loop;
end $$;
