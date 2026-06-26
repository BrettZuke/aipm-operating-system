-- ============================================================================
-- Lock down ai_usage_daily — it is the Settoku Chat spend-cap ledger.
--
-- The generic agency RLS helper (private.enable_agency_rls, run by the loop in
-- 20260501000009_rls.sql over every table with an agency_id column) gave this
-- table two policies:
--   agency_select  FOR SELECT  using is_agency_member(agency_id)
--   agency_modify  FOR ALL     using/with check is_agency_member(agency_id)
--
-- `agency_modify` is FOR ALL — so any authenticated agency member can UPDATE or
-- DELETE their own usage row. That resets messages_sent / tokens_output to zero
-- and defeats the per-user daily cap the API route relies on. A member could
-- wipe the row between requests and run the Anthropic bill away unbounded.
--
-- Fix: the ledger is written ONLY by the API route's service-role client
-- (src/app/api/ai/chat/route.ts), and service_role bypasses RLS. So no
-- authenticated/anon write policy is needed — and none should exist. We drop the
-- permissive generic policies and leave only a self-scoped SELECT (harmless, and
-- handy for a future "your usage" view). With RLS still enabled and no policy
-- covering INSERT/UPDATE/DELETE, those commands are denied for every non-service
-- role, which is exactly the desired posture.
--
-- Idempotent: safe to re-run. `drop policy if exists` no-ops if already dropped;
-- the self-read policy is dropped-then-created so a re-run refreshes it.
-- ============================================================================

-- RLS is already enabled by the earlier loop, but assert it so this migration is
-- correct even if applied out of order / against a fresh DB.
alter table public.ai_usage_daily enable row level security;

-- Remove the tamper vector (FOR ALL) and the broad agency-wide read.
drop policy if exists agency_modify on public.ai_usage_daily;
drop policy if exists agency_select on public.ai_usage_daily;

-- Members may read only their OWN usage. No write policy ⇒ writes are
-- service-role-only (service_role bypasses RLS). (select auth.uid()) is the
-- Supabase-recommended form — evaluated once per query, not per row.
drop policy if exists ai_usage_daily_self_read on public.ai_usage_daily;
create policy ai_usage_daily_self_read on public.ai_usage_daily
  for select using (user_id = (select auth.uid()));
