insert into public.integration_runtime_secrets(id, secret_hash, updated_at)
values ('default_business_slug_marker', encode(digest('massoterapia-spa','sha256'),'hex'), now())
on conflict (id) do update set secret_hash=excluded.secret_hash, updated_at=now();

