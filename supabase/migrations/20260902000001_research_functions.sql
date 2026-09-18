-- Research: the three database functions that hand out a day's allowance and start a scan.
--
-- Why these are in the database rather than in the app. Every cap the app enforces used to be a
-- count read first and a write done second, and two clicks a moment apart both read the same count
-- and both passed. The same was true of starting a scan: two starts could both see no scan running.
-- Each function below takes a lock for that one workspace, counts inside the lock, and writes before
-- letting go, so a cap can never be passed by clicking twice and a second scan can never start
-- alongside the first.
--
-- They run as their owner (security definer) and only the service role may call them, so nothing a
-- signed-in member sends can reach them directly.
--
-- The window's upper end is clock_timestamp(), the real time now, not now(), which is the time the
-- transaction began: a row another transaction committed while this one waited for the lock has to
-- count, or the lock would not be doing its job.
--
-- Additive only. Safe to run twice. Apply with the Supabase CLI, or paste into the SQL editor of
-- your project.

-- Reserve one of today's allowance of something for one workspace. True means it was reserved and
-- the work may spend; false means the cap is used up.
create or replace function public.research_reserve(
  p_agency uuid,
  p_kind text,
  p_cap integer,
  p_since timestamptz,
  p_ref text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_agency is null or p_kind is null or p_cap is null or p_cap < 0
     or p_since is null or p_since > clock_timestamp() then
    raise exception 'research_reserve: an agency, a kind, a cap of zero or more and a since in the past are required';
  end if;
  if p_kind = 'youtube_search' then
    raise exception 'research_reserve: youtube_search is shared by every workspace, reserve it with research_reserve_global';
  end if;

  perform pg_advisory_xact_lock(hashtext('research_usage'), hashtext(p_agency::text || '/' || p_kind));

  select count(*) into v_used
    from public.research_usage
   where agency_id = p_agency
     and kind = p_kind
     and created_at >= p_since
     and created_at <= clock_timestamp();
  if v_used >= p_cap then
    return false;
  end if;

  insert into public.research_usage (agency_id, kind, ref, created_at)
  values (p_agency, p_kind, left(p_ref, 200), clock_timestamp());
  return true;
end;
$$;

-- The same, but counted across every workspace. Used for the YouTube search allowance, which
-- belongs to one key that every workspace on this dashboard shares.
create or replace function public.research_reserve_global(
  p_agency uuid,
  p_kind text,
  p_cap integer,
  p_since timestamptz,
  p_ref text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_agency is null or p_kind is distinct from 'youtube_search' or p_cap is null or p_cap < 0
     or p_since is null or p_since > clock_timestamp() then
    raise exception 'research_reserve_global: an agency, the youtube_search kind, a cap of zero or more and a since in the past are required';
  end if;

  perform pg_advisory_xact_lock(hashtext('research_usage'), hashtext('global/' || p_kind));

  select count(*) into v_used
    from public.research_usage
   where kind = p_kind
     and created_at >= p_since
     and created_at <= clock_timestamp();
  if v_used >= p_cap then
    return false;
  end if;

  insert into public.research_usage (agency_id, kind, ref, created_at)
  values (p_agency, p_kind, left(p_ref, 200), clock_timestamp());
  return true;
end;
$$;

-- Start a scan job, applying every start rule inside one lock for this workspace. Answers
-- {"job_id": ...} with the row written, or {"refusal": ...} with nothing written. An unfinished job
-- older than p_in_flight_secs is treated as stuck and blocks nothing.
create or replace function public.research_start_job(
  p_agency uuid,
  p_purpose text,
  p_mode text,
  p_creator_ids uuid[],
  p_max_charge_usd numeric,
  p_webhook_token_hash text,
  p_started_by uuid,
  p_in_flight_secs integer,
  p_max_onboards integer,
  p_since timestamptz,
  p_daily_ceiling_usd numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_after timestamptz;
  v_spent numeric;
  v_job uuid;
begin
  if p_agency is null
     or p_purpose is null or p_purpose not in ('scan', 'onboard')
     or p_mode is null or p_mode not in ('full', 'recent')
     or coalesce(cardinality(p_creator_ids), 0) = 0
     or (p_purpose = 'onboard' and cardinality(p_creator_ids) <> 1)
     or p_max_charge_usd is null or p_max_charge_usd <= 0
     or p_webhook_token_hash is null or p_webhook_token_hash !~ '^[0-9a-f]{64}$'
     or p_in_flight_secs is null or p_in_flight_secs <= 0
     or p_max_onboards is null or p_max_onboards < 0
     or p_since is null or p_since > clock_timestamp()
     or p_daily_ceiling_usd is null or p_daily_ceiling_usd <= 0 then
    raise exception 'research_start_job: invalid arguments';
  end if;

  perform pg_advisory_xact_lock(hashtext('research_jobs'), hashtext(p_agency::text));
  v_live_after := clock_timestamp() - make_interval(secs => p_in_flight_secs);

  if p_purpose = 'scan' then
    if exists (
      select 1 from public.research_jobs
       where agency_id = p_agency
         and purpose = 'scan'
         and status in ('starting', 'running', 'ingesting')
         and created_at > v_live_after
    ) then
      return jsonb_build_object('refusal', 'scan_running');
    end if;
  else
    if exists (
      select 1 from public.research_jobs
       where agency_id = p_agency
         and status in ('starting', 'running', 'ingesting')
         and created_at > v_live_after
         and creator_ids && p_creator_ids
    ) then
      return jsonb_build_object('refusal', 'creator_in_flight');
    end if;
    if (
      select count(*) from public.research_jobs
       where agency_id = p_agency
         and purpose = 'onboard'
         and status in ('starting', 'running', 'ingesting')
         and created_at > v_live_after
    ) >= p_max_onboards then
      return jsonb_build_object('refusal', 'onboards_full');
    end if;
  end if;

  -- What today's jobs were already allowed to spend. A job that failed before its run started cost
  -- nothing and read nobody, so it does not count.
  select coalesce(sum(max_charge_usd), 0) into v_spent
    from public.research_jobs
   where agency_id = p_agency
     and created_at >= p_since
     and (status <> 'failed' or apify_run_id is not null);
  if v_spent + p_max_charge_usd > p_daily_ceiling_usd then
    return jsonb_build_object('refusal', 'daily_ceiling', 'spent_usd', v_spent);
  end if;

  insert into public.research_jobs (
    agency_id, kind, purpose, mode, status, webhook_token_hash, creator_ids, max_charge_usd, started_by
  ) values (
    p_agency, 'instagram_scan', p_purpose, p_mode, 'starting', p_webhook_token_hash, p_creator_ids, p_max_charge_usd, p_started_by
  )
  returning id into v_job;
  return jsonb_build_object('job_id', v_job);
end;
$$;

-- Only the service role may run these. A new function in the public schema is callable by PUBLIC,
-- which the signed-in roles inherit, so PUBLIC is revoked as well as the two roles by name.
revoke all on function public.research_reserve(uuid, text, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.research_reserve_global(uuid, text, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.research_start_job(uuid, text, text, uuid[], numeric, text, uuid, integer, integer, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.research_reserve(uuid, text, integer, timestamptz, text) to service_role;
grant execute on function public.research_reserve_global(uuid, text, integer, timestamptz, text) to service_role;
grant execute on function public.research_start_job(uuid, text, text, uuid[], numeric, text, uuid, integer, integer, timestamptz, numeric) to service_role;
