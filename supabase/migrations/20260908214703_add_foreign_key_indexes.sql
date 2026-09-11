create index if not exists idx_appointment_events_actor_user_id on public.appointment_events(actor_user_id);
create index if not exists idx_appointment_events_appointment_id on public.appointment_events(appointment_id);
create index if not exists idx_appointments_client_id on public.appointments(client_id);
create index if not exists idx_appointments_package_id on public.appointments(package_id);
create index if not exists idx_appointments_service_id on public.appointments(service_id);
create index if not exists idx_audit_logs_actor_user_id on public.audit_logs(actor_user_id);
create index if not exists idx_blocked_periods_created_by on public.blocked_periods(created_by);
create index if not exists idx_campaign_recipients_client_id on public.campaign_recipients(client_id);
create index if not exists idx_campaign_recipients_whatsapp_message_id on public.campaign_recipients(whatsapp_message_id);
create index if not exists idx_campaigns_created_by on public.campaigns(created_by);
create index if not exists idx_notification_jobs_appointment_id on public.notification_jobs(appointment_id);
create index if not exists idx_notification_jobs_client_id on public.notification_jobs(client_id);
create index if not exists idx_whatsapp_conversations_client_id on public.whatsapp_conversations(client_id);
create index if not exists idx_whatsapp_messages_conversation_id on public.whatsapp_messages(conversation_id);

