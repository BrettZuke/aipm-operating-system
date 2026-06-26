-- ============================================================================
-- Self-annealing improvement queue.
--
-- Every audit finding (bug, tech-debt, missing data, security advisory, perf
-- regression, feature request) lands here. The /api/cron/anneal endpoint pulls
-- the highest-priority open item once per tick, and either an external worker
-- (Railway / N8N / manual) does the work or surfaces it for triage.
--
-- Status flow:
--   open → in_progress → (done | blocked | cancelled)
-- ============================================================================

do $$ begin
  create type improvement_kind as enum ('bug', 'tech_debt', 'feature', 'audit', 'security', 'perf', 'data_quality');
exception when duplicate_object then null; end $$;

do $$ begin
  create type improvement_status as enum ('open', 'in_progress', 'done', 'blocked', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.improvements (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  kind improvement_kind not null default 'bug',
  status improvement_status not null default 'open',

  -- Priority 1 (urgent / blocker) → 5 (someday). Lower numbers handled first.
  priority smallint not null default 3,

  title text not null,
  description text,                -- markdown OK
  evidence text,                   -- "where I saw this" — log line, screenshot URL, etc.
  proposed_fix text,               -- markdown — what I think we should do
  files_touched text[] default '{}', -- file paths the fix would likely touch

  -- Source: where this came from. Lets the cron filter (e.g. "only auto-fix tech_debt")
  source text default 'manual',    -- 'manual' | 'self_discover' | 'audit' | 'lint' | 'npm_audit' | 'health_check'

  -- Worker tracking
  attempted_at timestamptz,
  attempt_count int not null default 0,
  last_attempt_log text,           -- last harness output / error
  resolved_at timestamptz,

  -- Free-form
  data jsonb default '{}',

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists improvements_agency_idx on public.improvements (agency_id, status, priority);
create index if not exists improvements_open_priority_idx on public.improvements (agency_id, priority, created_at) where status = 'open';
-- Idempotency: don't double-add the same finding from self-discovery
create unique index if not exists improvements_unique_signature
  on public.improvements (agency_id, source, title) where status in ('open', 'in_progress');
