insert into public.meta_integrations (business_id, waba_id, status, coexistence_enabled, updated_at)
select b.id, '1078326045086236', 'testing', false, now()
from public.businesses b
where b.slug = 'massoterapia-spa'
on conflict (business_id) do update set waba_id = excluded.waba_id, status = excluded.status, updated_at = now();

