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
    execute format(
      'create policy tenant_access on public.%I for all to authenticated using (private.current_user_can_access_business(business_id)) with check (private.current_user_can_access_business(business_id))',
      t
    );
  end loop;
end $$;

