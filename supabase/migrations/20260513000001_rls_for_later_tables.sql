-- ============================================================================
-- Backfill RLS for tables added after the initial RLS pass (000009_rls.sql).
-- Flagged by Supabase Advisors on 2026-05-11:
--   - public.webinars              (agency_id)
--   - public.webinar_registrations (via webinar_id → webinars.agency_id)
--   - public.improvements          (agency_id)
--
-- Self-contained: doesn't rely on private.enable_agency_rls helper, in case
-- migration history has drifted in prod.
-- ============================================================================

-- webinars: agency-scoped
alter table public.webinars enable row level security;
drop policy if exists webinars_agency_select on public.webinars;
create policy webinars_agency_select on public.webinars for select
  using (public.is_agency_member(agency_id));
drop policy if exists webinars_agency_modify on public.webinars;
create policy webinars_agency_modify on public.webinars for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

-- improvements: agency-scoped
alter table public.improvements enable row level security;
drop policy if exists improvements_agency_select on public.improvements;
create policy improvements_agency_select on public.improvements for select
  using (public.is_agency_member(agency_id));
drop policy if exists improvements_agency_modify on public.improvements;
create policy improvements_agency_modify on public.improvements for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

-- webinar_registrations: gate via parent webinar's agency
alter table public.webinar_registrations enable row level security;
drop policy if exists webinar_registrations_via_webinar on public.webinar_registrations;
create policy webinar_registrations_via_webinar on public.webinar_registrations for all
  using (exists (
    select 1 from public.webinars w
    where w.id = webinar_registrations.webinar_id
      and public.is_agency_member(w.agency_id)
  ))
  with check (exists (
    select 1 from public.webinars w
    where w.id = webinar_registrations.webinar_id
      and public.is_agency_member(w.agency_id)
  ));
