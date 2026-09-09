create extension if not exists btree_gist;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  organization_type text not null check (organization_type in ('provider','client')),
  parent_provider_id uuid references public.organizations(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/Sao_Paulo',
  phone_e164 text,
  address_text text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table if not exists public.meta_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider_organization_id uuid references public.organizations(id) on delete set null,
  meta_app_id text,
  business_portfolio_id text,
  waba_id text,
  status text not null default 'not_connected' check (status in ('not_connected','testing','connected','suspended','error')),
  coexistence_enabled boolean not null default false,
  coexistence_status text,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  meta_integration_id uuid references public.meta_integrations(id) on delete set null,
  waba_id text,
  display_name text,
  status text not null default 'testing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, waba_id)
);

create table if not exists public.whatsapp_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete cascade,
  phone_number_id text,
  phone_e164 text,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  coexistence_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone_number_id),
  unique (business_id, phone_e164)
);

insert into public.organizations (name, slug, organization_type)
values ('Duduzzn tech', 'duduzzn-tech', 'provider')
on conflict (slug) do update set name = excluded.name, organization_type = excluded.organization_type, updated_at = now();

insert into public.organizations (name, slug, organization_type, parent_provider_id)
select 'Massoterapia Spa', 'massoterapia-spa', 'client', p.id
from public.organizations p
where p.slug = 'duduzzn-tech'
on conflict (slug) do update set
  name = excluded.name,
  organization_type = excluded.organization_type,
  parent_provider_id = excluded.parent_provider_id,
  updated_at = now();

insert into public.businesses (organization_id, name, slug, timezone, phone_e164, address_text)
select o.id, 'Massoterapia Spa', 'massoterapia-spa', 'America/Sao_Paulo', '+5519993297780', 'R. Samuel Fragoso Coimbra, 483 - Valinhos - SP'
from public.organizations o
where o.slug = 'massoterapia-spa'
on conflict (slug) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  timezone = excluded.timezone,
  phone_e164 = excluded.phone_e164,
  address_text = excluded.address_text,
  updated_at = now();

create or replace function public.default_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.businesses where slug = 'massoterapia-spa' and active = true limit 1
$$;

revoke all on function public.default_business_id() from public;
grant execute on function public.default_business_id() to authenticated, service_role;

do $$
declare
  t text;
  tables text[] := array[
    'services','service_packages','clients','availability_rules','blocked_periods','appointments',
    'appointment_events','client_consents','whatsapp_contacts','whatsapp_conversations','whatsapp_messages',
    'message_templates','quick_replies','campaigns','campaign_recipients','notification_jobs','audit_logs',
    'calendar_sync_state','google_oauth_states'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists business_id uuid', t);
    execute format('update public.%I set business_id = public.default_business_id() where business_id is null', t);
    execute format('alter table public.%I alter column business_id set default public.default_business_id()', t);
    execute format('alter table public.%I alter column business_id set not null', t);
    begin
      execute format('alter table public.%I add constraint %I foreign key (business_id) references public.businesses(id) on delete restrict', t, t || '_business_id_fkey');
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

alter table public.clients drop constraint if exists clients_phone_e164_key;
alter table public.clients add constraint clients_business_phone_key unique (business_id, phone_e164);

alter table public.services drop constraint if exists services_slug_key;
alter table public.services add constraint services_business_slug_key unique (business_id, slug);

alter table public.message_templates drop constraint if exists message_templates_name_key;
alter table public.message_templates add constraint message_templates_business_name_key unique (business_id, name);

alter table public.quick_replies drop constraint if exists quick_replies_shortcut_key;
alter table public.quick_replies add constraint quick_replies_business_shortcut_key unique (business_id, shortcut);

alter table public.appointments drop constraint if exists appointments_google_event_id_key;
alter table public.appointments add constraint appointments_business_google_event_key unique (business_id, google_event_id);

alter table public.notification_jobs drop constraint if exists notification_jobs_idempotency_key_key;
alter table public.notification_jobs add constraint notification_jobs_business_idempotency_key unique (business_id, idempotency_key);

alter table public.whatsapp_contacts drop constraint if exists whatsapp_contacts_wa_id_key;
alter table public.whatsapp_contacts add constraint whatsapp_contacts_business_wa_id_key unique (business_id, wa_id);

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_meta_message_id_key;
alter table public.whatsapp_messages add constraint whatsapp_messages_business_meta_message_key unique (business_id, meta_message_id);

alter table public.appointments drop constraint if exists appointments_no_active_overlap;
alter table public.appointments add constraint appointments_no_active_overlap
  exclude using gist (
    business_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending'::appointment_status, 'confirmed'::appointment_status));

alter table public.calendar_sync_state drop constraint if exists calendar_sync_state_singleton_id_check;
alter table public.calendar_sync_state drop constraint if exists calendar_sync_state_pkey;
alter table public.calendar_sync_state add constraint calendar_sync_state_pkey primary key (business_id);
create index if not exists calendar_sync_state_singleton_idx on public.calendar_sync_state(singleton_id);

create index if not exists businesses_organization_id_idx on public.businesses(organization_id);
create index if not exists business_members_user_id_idx on public.business_members(user_id);
create index if not exists business_members_business_id_idx on public.business_members(business_id);
create index if not exists meta_integrations_business_id_idx on public.meta_integrations(business_id);
create index if not exists whatsapp_accounts_business_id_idx on public.whatsapp_accounts(business_id);
create index if not exists whatsapp_phone_numbers_business_id_idx on public.whatsapp_phone_numbers(business_id);
create index if not exists services_business_id_idx on public.services(business_id);
create index if not exists clients_business_id_idx on public.clients(business_id);
create index if not exists appointments_business_starts_idx on public.appointments(business_id, starts_at);
create index if not exists blocked_periods_business_starts_idx on public.blocked_periods(business_id, starts_at);
create index if not exists availability_rules_business_weekday_idx on public.availability_rules(business_id, weekday);
create index if not exists whatsapp_messages_business_created_idx on public.whatsapp_messages(business_id, created_at desc);
create index if not exists whatsapp_conversations_business_last_idx on public.whatsapp_conversations(business_id, last_message_at desc);
create index if not exists notification_jobs_business_status_idx on public.notification_jobs(business_id, status, scheduled_for);
create index if not exists campaigns_business_id_idx on public.campaigns(business_id);

create or replace function public.user_can_access_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = auth.uid()
      and bm.active = true
  ) or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'admin'
  )
$$;

revoke all on function public.user_can_access_business(uuid) from public;
grant execute on function public.user_can_access_business(uuid) to authenticated, service_role;

alter table public.organizations enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.meta_integrations enable row level security;
alter table public.whatsapp_accounts enable row level security;
alter table public.whatsapp_phone_numbers enable row level security;

create policy organizations_authenticated_read on public.organizations for select to authenticated using (
  exists (
    select 1 from public.businesses b
    where b.organization_id = organizations.id and public.user_can_access_business(b.id)
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'admin')
);
create policy businesses_member_read on public.businesses for select to authenticated using (public.user_can_access_business(id));
create policy business_members_member_read on public.business_members for select to authenticated using (public.user_can_access_business(business_id));
create policy meta_integrations_member_read on public.meta_integrations for select to authenticated using (public.user_can_access_business(business_id));
create policy whatsapp_accounts_member_read on public.whatsapp_accounts for select to authenticated using (public.user_can_access_business(business_id));
create policy whatsapp_phone_numbers_member_read on public.whatsapp_phone_numbers for select to authenticated using (public.user_can_access_business(business_id));
