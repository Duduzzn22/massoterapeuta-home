create index if not exists idx_clients_business_id on public.clients(business_id);
create index if not exists idx_appointments_business_id on public.appointments(business_id);
create index if not exists idx_services_business_id on public.services(business_id);
create index if not exists idx_availability_rules_business_id on public.availability_rules(business_id);
create index if not exists idx_blocked_periods_business_id on public.blocked_periods(business_id);
create index if not exists idx_whatsapp_messages_business_id on public.whatsapp_messages(business_id);
create index if not exists idx_whatsapp_conversations_business_id on public.whatsapp_conversations(business_id);
create index if not exists idx_notification_jobs_business_id on public.notification_jobs(business_id);

