-- Massoterapeuta Home CRM — schema inicial
-- Este arquivo é uma especificação de schema. Aplicar somente em um projeto Supabase exclusivo.

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
  create type public.user_role as enum ('admin', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_status as enum (
    'pending', 'confirmed', 'completed', 'cancelled', 'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_location as enum ('spa', 'home_care');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.crm_stage as enum (
    'new_lead',
    'waiting_response',
    'waiting_confirmation',
    'scheduled',
    'attended',
    'follow_up',
    'recurring',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_category as enum ('whatsapp_service', 'whatsapp_marketing');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_status as enum (
    'queued', 'sent', 'delivered', 'read', 'failed', 'received'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.campaign_status as enum ('draft', 'scheduled', 'sending', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ============================================================
-- AUTH / ADMIN
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CATÁLOGO INTERNO
-- ============================================================

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes between 15 and 240),
  price_cents integer check (price_cents is null or price_cents >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  session_count integer not null check (session_count > 0),
  price_cents integer check (price_cents is null or price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CLIENTES E CONSENTIMENTOS
-- ============================================================

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_e164 text not null unique,
  email text,
  city text,
  neighborhood text,
  crm_stage public.crm_stage not null default 'new_lead',
  source text not null default 'website',
  blocked boolean not null default false,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_consents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  category public.consent_category not null,
  granted boolean not null,
  consent_text_version text not null,
  source text not null,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_client_consents_client_category
  on public.client_consents(client_id, category, recorded_at desc);

-- ============================================================
-- DISPONIBILIDADE
-- ============================================================

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 15 and 180),
  active boolean not null default true,
  check (end_time > start_time)
);

create table if not exists public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- ============================================================
-- AGENDAMENTOS
-- ============================================================

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  package_id uuid references public.service_packages(id) on delete set null,
  status public.appointment_status not null default 'pending',
  location_type public.appointment_location not null default 'spa',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  home_city text,
  home_neighborhood text,
  -- Notas devem ser mínimas; evitar dados clínicos desnecessários.
  customer_note text,
  admin_note text,
  google_event_id text unique,
  booking_token_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at)
);

-- Para um único profissional, impede sobreposição de atendimentos ativos.
-- Se futuramente houver vários profissionais, incluir resource/professional_id na constraint.
create index if not exists idx_appointments_starts_at on public.appointments(starts_at);
create index if not exists idx_appointments_status_starts on public.appointments(status, starts_at);

-- Exclusion constraint idempotente via bloco DO.
do $$ begin
  alter table public.appointments
    add constraint appointments_no_active_overlap
    exclude using gist (
      tstzrange(starts_at, ends_at, '[)') with &&
    )
    where (status in ('pending', 'confirmed'));
exception when duplicate_object then null; end $$;

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- WHATSAPP / CRM
-- ============================================================

create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  wa_id text unique,
  profile_name text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  opened_at timestamptz not null default now(),
  last_message_at timestamptz,
  customer_service_window_until timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  meta_message_id text unique,
  direction public.message_direction not null,
  status public.message_status not null,
  message_type text not null,
  template_name text,
  body_preview text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_messages_client_created
  on public.whatsapp_messages(client_id, created_at desc);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  meta_template_id text,
  name text not null unique,
  language_code text not null default 'pt_BR',
  category text not null,
  status text not null default 'draft',
  purpose text,
  body text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  shortcut text not null unique,
  title text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CAMPANHAS
-- ============================================================

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_name text not null,
  status public.campaign_status not null default 'draft',
  scheduled_for timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  whatsapp_message_id uuid references public.whatsapp_messages(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(campaign_id, client_id)
);

-- ============================================================
-- FILA DE AUTOMAÇÃO
-- ============================================================

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  job_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  idempotency_key text not null unique,
  attempts integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_jobs_due
  on public.notification_jobs(status, scheduled_for);

-- ============================================================
-- AUDITORIA
-- ============================================================

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.service_packages enable row level security;
alter table public.clients enable row level security;
alter table public.client_consents enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blocked_periods enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_events enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.message_templates enable row level security;
alter table public.quick_replies enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.audit_logs enable row level security;

-- Perfil: usuário autenticado enxerga apenas o próprio perfil.
drop policy if exists "profile_self_select" on public.profiles;
create policy "profile_self_select"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Políticas administrativas. O serviço público usa Edge Functions e não acesso direto anon.
-- Cada policy consulta somente o próprio profile do usuário autenticado.

do $$
declare
  t text;
begin
  foreach t in array array[
    'services','service_packages','clients','client_consents','availability_rules',
    'blocked_periods','appointments','appointment_events','whatsapp_contacts',
    'whatsapp_conversations','whatsapp_messages','message_templates','quick_replies',
    'campaigns','campaign_recipients','notification_jobs','audit_logs'
  ]
  loop
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format(
      'create policy "admin_all" on public.%I for all to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active = true and p.role = ''admin'')) with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active = true and p.role = ''admin''))',
      t
    );
  end loop;
end $$;

-- Nenhuma policy para anon é criada intencionalmente.
-- A API pública será mediada por Edge Functions com validação e rate limiting.

-- ============================================================
-- DADOS INICIAIS (idempotentes)
-- ============================================================

insert into public.services (slug, name, description, duration_minutes, active, sort_order)
values
  ('massagem-sueca', 'Massagem Sueca', 'Massagem suave e progressiva para relaxamento e bem-estar.', 60, true, 10),
  ('massagem-terapeutica', 'Massagem Terapêutica', 'Atendimento com foco em tensão e conforto muscular.', 60, true, 20),
  ('pedras-quentes', 'Pedras Quentes', 'Sessão com aplicação de calor terapêutico.', 60, true, 30),
  ('ventosoterapia', 'Ventosoterapia', 'Sessão de ventosoterapia conforme avaliação profissional.', 60, true, 40),
  ('drenagem-linfatica', 'Drenagem Linfática', 'Sessão de drenagem linfática.', 60, true, 50),
  ('miracle-face', 'Miracle Face', 'Tratamento facial especializado.', 60, true, 60)
on conflict (slug) do nothing;

insert into public.quick_replies (shortcut, title, body)
values
  ('/valores', 'Valores', 'Olá! Vou te enviar os valores e opções de atendimento disponíveis.'),
  ('/endereco', 'Endereço', 'Nosso espaço fica na R. Samuel Fragoso Coimbra, 483, Valinhos - SP.'),
  ('/homecare', 'Home care', 'Também realizamos atendimento home care. Informe seu bairro e cidade para verificarmos disponibilidade.'),
  ('/horarios', 'Horários', 'Vou verificar os horários disponíveis para você. Qual dia prefere?'),
  ('/preparo', 'Preparo', 'Antes da sessão, use roupas confortáveis e informe qualquer restrição relevante diretamente à profissional.'),
  ('/pacote4', 'Pacote 4 sessões', 'Temos opção de pacote com 4 sessões. Posso te enviar detalhes e disponibilidade.'),
  ('/pacote8', 'Pacote 8 sessões', 'Temos opção de pacote com 8 sessões. Posso te enviar detalhes e disponibilidade.'),
  ('/confirmar', 'Confirmar', 'Seu horário está reservado. Assim que a confirmação for concluída, você receberá os dados do atendimento.'),
  ('/pix', 'PIX', 'Vou te enviar os dados de pagamento e as instruções para confirmação.'),
  ('/remarcar', 'Remarcar', 'Sem problema. Me diga o novo dia/período que você prefere para verificarmos disponibilidade.'),
  ('/cancelar', 'Cancelar', 'Entendido. Vou registrar o cancelamento do seu atendimento.')
on conflict (shortcut) do nothing;
