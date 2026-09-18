-- Competitor outliers found by the content machine's parser.
--
-- Until now these lived only in .tmp/_signal/<date>.json on whoever's laptop ran the parser, so the
-- dashboard could show the COUNT ("208 winners") but never the winners themselves, and a client on
-- their own workspace could never see theirs at all. This table is what makes the signal visible.
--
-- Multi-tenant exactly like content_machine_runs: agency_id on every row, RLS via is_agency_member,
-- and every read in (app) MUST also filter agency_id explicitly, because View-as swaps in a
-- service-role client and RLS stops running.

create table if not exists public.content_outliers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  run_id uuid references public.content_machine_runs(id) on delete set null,

  -- identity of the post
  url text not null,
  platform text not null check (platform in ('instagram', 'youtube')),
  creator text,
  handle text,
  posted date,
  post_type text,

  -- the maths: why this counts as an outlier.
  -- metric travels with the row because carousels report no view count, so those creators are
  -- scored on engagement instead. Reading `multiple` without `metric` misleads.
  metric text not null,
  score numeric,
  creator_median numeric,
  multiple numeric,
  views bigint,
  likes bigint,
  comments bigint,

  -- the analysis: only populated for the top N the LLM actually studied.
  -- 208 found vs 25 analysed on 2026-07-29, so most rows are maths-only by design.
  analysed boolean not null default false,
  caption_hook text,
  caption text,
  hook_type text,
  hook_template text,
  format text,
  ask text,
  why_it_worked text,

  created_at timestamptz not null default now(),

  -- one row per post per workspace; re-running the parser updates rather than duplicates
  unique (agency_id, url)
);

create index if not exists content_outliers_agency_idx
  on public.content_outliers (agency_id, created_at desc);

create index if not exists content_outliers_agency_multiple_idx
  on public.content_outliers (agency_id, multiple desc);

create index if not exists content_outliers_run_idx
  on public.content_outliers (run_id);

alter table public.content_outliers enable row level security;

-- File 09 gives every table with an agency_id a generic agency_select / agency_modify pair.
-- On a fresh database that sweep runs before this table exists, so it never sees it; on a
-- re-run of the whole folder it does. Dropping those two names here, before this table's own
-- policies, is what keeps one pass and two passes identical.
drop policy if exists agency_modify on public.content_outliers;
drop policy if exists agency_select on public.content_outliers;

drop policy if exists content_outliers_agency_select on public.content_outliers;
create policy content_outliers_agency_select on public.content_outliers
  for select using (is_agency_member(agency_id));

drop policy if exists content_outliers_agency_modify on public.content_outliers;
create policy content_outliers_agency_modify on public.content_outliers
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
