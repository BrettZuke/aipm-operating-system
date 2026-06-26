-- ============================================================================
-- Wave 1 / H8 — Make activity_log.agency_id NOT NULL.
--
-- activity_log.agency_id is nullable (20260501000007_intelligence.sql:122). The
-- dynamic tenant RLS gates rows with is_agency_member(agency_id), and
-- is_agency_member(NULL) is false — so any row written with agency_id = NULL is
-- invisible to every user through RLS yet still readable by service-role crons.
-- That is a one-way audit blind spot. Enforcing NOT NULL removes it.
--
-- This migration FAILS LOUDLY (it does not delete data) if null-agency rows
-- already exist, so an operator can decide to backfill them with the correct
-- agency_id or remove the un-attributable rows, then re-run.
-- ============================================================================

do $$
declare n bigint;
begin
  select count(*) into n from public.activity_log where agency_id is null;
  if n > 0 then
    raise exception
      'activity_log has % row(s) with null agency_id. Backfill them with the correct agency_id (or delete un-attributable rows), then re-run this migration.', n;
  end if;
end;
$$;

alter table public.activity_log alter column agency_id set not null;
