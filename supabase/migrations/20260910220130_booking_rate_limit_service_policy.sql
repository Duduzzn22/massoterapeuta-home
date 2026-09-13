create policy booking_rate_limits_service_role
on public.booking_rate_limits
for all
to service_role
using (true)
with check (true);
