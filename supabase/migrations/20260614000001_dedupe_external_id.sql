-- Webhook idempotency: prevent duplicate payments/calls from concurrent webhook re-deliveries.
--
-- FanBasis / iClosed / Typeform all re-send an event if they don't get a fast 200. The app code
-- does a "check then insert" dedup, but two concurrent re-deliveries can both pass the check and
-- insert the same row → a single payment counted twice. This adds a DB-level guarantee.
--
-- Safe to run more than once. Runs in a single transaction: if anything fails, nothing changes.
-- NULL external_id rows (manual UI entries) are unaffected — Postgres treats NULLs as distinct,
-- so they never collide with each other or block the index.

begin;

-- 1. Remove any pre-existing duplicates, keeping the earliest row in each group.
delete from public.transactions t
using (
  select id,
         row_number() over (partition by agency_id, external_id order by created_at asc, id asc) as rn
  from public.transactions
  where external_id is not null
) d
where t.id = d.id and d.rn > 1;

delete from public.calls c
using (
  select id,
         row_number() over (partition by agency_id, external_id order by occurred_at asc, id asc) as rn
  from public.calls
  where external_id is not null
) d
where c.id = d.id and d.rn > 1;

-- 2. Enforce uniqueness so a duplicate can never be inserted again. The webhook handlers catch
--    the resulting 23505 and treat it as an idempotent no-op (no 500, no double-count).
create unique index if not exists transactions_agency_external_uniq
  on public.transactions (agency_id, external_id);

create unique index if not exists calls_agency_external_uniq
  on public.calls (agency_id, external_id);

commit;
