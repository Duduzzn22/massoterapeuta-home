-- Google Calendar bidirectional synchronization
-- iPhone Calendar -> Google Calendar -> Supabase

alter table public.blocked_periods
  add column if not exists source text not null default 'manual',
  add column if not exists google_event_id text,
  add column if not exists google_event_etag text,
  add column if not exists google_event_updated_at timestamptz,
  add column if not exists is_all_day boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.blocked_periods
    add constraint blocked_periods_source_check
    check (source in ('manual', 'google_calendar'));
exception when duplicate_object then null; end $$;

create unique index if not exists idx_blocked_periods_google_event_id
  on public.blocked_periods(google_event_id)
  where google_event_id is not null;

create index if not exists idx_blocked_periods_source_starts
  on public.blocked_periods(source, starts_at);

alter table public.appointments
  add column if not exists google_event_etag text,
  add column if not exists google_event_updated_at timestamptz,
  add column if not exists google_last_synced_at timestamptz;

create table if not exists public.calendar_sync_state (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  calendar_id text not null,
  sync_token text,
  watch_channel_id text unique,
  watch_resource_id text,
  watch_token_hash text,
  watch_expires_at timestamptz,
  last_message_number bigint,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  last_notification_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_sync_state enable row level security;

drop policy if exists "admin_all" on public.calendar_sync_state;
create policy "admin_all" on public.calendar_sync_state
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.role = 'admin'
  )
);

revoke all on public.calendar_sync_state from anon;
grant select, insert, update, delete on public.calendar_sync_state to authenticated;
