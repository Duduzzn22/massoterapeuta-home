delete from public.calendar_bootstrap_tokens where expires_at < now() or used_at is not null;

