create table if not exists public.calendar_bootstrap_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.calendar_bootstrap_tokens enable row level security;
revoke all on public.calendar_bootstrap_tokens from anon;
revoke all on public.calendar_bootstrap_tokens from authenticated;

create index if not exists idx_calendar_bootstrap_tokens_expires_at
  on public.calendar_bootstrap_tokens(expires_at);

