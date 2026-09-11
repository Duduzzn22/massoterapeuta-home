create table if not exists public.booking_rate_limits (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.booking_rate_limits enable row level security;
revoke all on public.booking_rate_limits from anon, authenticated;
grant select, insert, delete on public.booking_rate_limits to service_role;
grant usage, select on sequence public.booking_rate_limits_id_seq to service_role;

create index if not exists booking_rate_limits_business_phone_created_idx
  on public.booking_rate_limits (business_id, phone_hash, created_at desc);
create index if not exists booking_rate_limits_business_ip_created_idx
  on public.booking_rate_limits (business_id, ip_hash, created_at desc);
create index if not exists appointment_events_business_id_idx on public.appointment_events(business_id);
create index if not exists audit_logs_business_id_idx on public.audit_logs(business_id);
create index if not exists campaign_recipients_business_id_idx on public.campaign_recipients(business_id);
create index if not exists client_consents_business_id_idx on public.client_consents(business_id);
create index if not exists google_oauth_states_business_id_idx on public.google_oauth_states(business_id);
create index if not exists meta_integrations_provider_organization_id_idx on public.meta_integrations(provider_organization_id);
create index if not exists organizations_parent_provider_id_idx on public.organizations(parent_provider_id);
create index if not exists service_packages_business_id_idx on public.service_packages(business_id);
create index if not exists whatsapp_accounts_meta_integration_id_idx on public.whatsapp_accounts(meta_integration_id);
create index if not exists whatsapp_phone_numbers_account_id_idx on public.whatsapp_phone_numbers(whatsapp_account_id);

drop index if exists public.idx_clients_business_id;
drop index if exists public.idx_services_business_id;

drop policy if exists organizations_authenticated_read on public.organizations;
create policy organizations_authenticated_read
on public.organizations
for select
to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.organization_id = organizations.id
      and private.user_can_access_business(b.id)
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.role = 'admin'::public.user_role
  )
);

