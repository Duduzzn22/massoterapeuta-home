insert into public.whatsapp_phone_numbers (business_id, phone_number_id, phone_e164, display_phone_number, verified_name, coexistence_enabled, active)
select b.id, '1234775273061740', '+15552006830', '+1 555-200-6830', 'Meta Test Number', false, true
from public.businesses b
where b.slug = 'massoterapia-spa'
on conflict (business_id, phone_number_id) do update set active = true, updated_at = now();

