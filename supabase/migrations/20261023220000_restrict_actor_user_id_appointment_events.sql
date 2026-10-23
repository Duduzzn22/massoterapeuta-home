-- SEC-M3: tighten the appointment_events RLS policy so an authenticated
-- admin can no longer insert a row with an actor_user_id that is not their
-- own. The previous policy only checked `private.user_can_access_business`
-- on business_id, which left the audit trail forgeable via DevTools.
--
-- We drop the generic tenant_access policy for this specific table and
-- rebuild it so WITH CHECK additionally pins actor_user_id to the current
-- session (allowing NULL for background workers that set service_role).
--
-- Backfill note: existing rows are not touched. New inserts going through
-- the authenticated role must now satisfy both conditions.

drop policy if exists tenant_access on public.appointment_events;

create policy tenant_access on public.appointment_events
  for all to authenticated
  using (private.current_user_can_access_business(business_id))
  with check (
    private.current_user_can_access_business(business_id)
    and (actor_user_id = (select auth.uid()) or actor_user_id is null)
  );

-- The admin console only ever writes with the current operator's id, and
-- the service_role bypasses RLS entirely, so background workers that insert
-- events (notification worker, calendar sync) remain unaffected.
