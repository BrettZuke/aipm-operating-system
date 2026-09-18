-- The Content Machine roster: which creators a workspace scrapes, and what for.
--
-- Two distinct jobs share one table because the operator thinks of them as one list ("who am I
-- learning from"), and the difference is exactly one field:
--   role='strategist'  the Brain learns HOW to make content from them (craft, structure, hooks)
--   role='emulate'     a competitor whose actual content we copy; feeds daily signal and scripts
--   role='watch'       tracked at lower weight, not a copy target
--   role='ideas'       top-of-funnel inspiration only, never replicate their format
--
-- status='paused' keeps the row (and its history) but takes the creator out of the daily scrape
-- and out of what the Scripter reads. Deleting is the destructive option; pausing is the reversible
-- one, which is why the UI leads with pause.
--
-- Written by the operator through the app; read by the daily scrape pipeline and the Scripter.
-- Apply with the Supabase CLI, or paste into the SQL editor of the client's project.

create table if not exists public.content_creators (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  handle text not null,
  name text not null,
  instagram text,
  youtube text,
  role text not null default 'emulate'
    check (role in ('strategist','emulate','watch','ideas')),
  status text not null default 'active'
    check (status in ('active','paused')),
  note text,
  last_scraped_at timestamptz,
  posts_count integer not null default 0,
  videos_count integer not null default 0,
  followers integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per creator per workspace: re-adding an existing handle updates it rather than
-- duplicating the roster, which is what the seed and the add form both rely on.
create unique index if not exists content_creators_agency_handle_key
  on public.content_creators (agency_id, lower(handle));

create index if not exists content_creators_agency_role_idx
  on public.content_creators (agency_id, role, status);

comment on table public.content_creators is
  'Content Machine roster per workspace: creators being scraped and the job each one does (strategist teaches craft, emulate is a copy target, watch is tracked, ideas is TOF inspiration only). status=paused drops a creator from the daily scrape without losing its history.';

-- RLS mirrors brain_sources / content_cards: agency members read and manage their own roster;
-- the scrape pipeline writes counts with the service role.
alter table public.content_creators enable row level security;

-- File 09 gives every table with an agency_id a generic agency_select / agency_modify pair.
-- On a fresh database that sweep runs before this table exists, so it never sees it; on a
-- re-run of the whole folder it does. Dropping those two names here, before this table's own
-- policies, is what keeps one pass and two passes identical.
drop policy if exists agency_modify on public.content_creators;
drop policy if exists agency_select on public.content_creators;

drop policy if exists content_creators_agency_select on public.content_creators;
create policy content_creators_agency_select on public.content_creators
  for select using (is_agency_member(agency_id));

drop policy if exists content_creators_agency_modify on public.content_creators;
create policy content_creators_agency_modify on public.content_creators
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));

-- The updated_at trigger. File 08 applies one to every table that has an updated_at column,
-- but on a fresh database that sweep runs before this table exists, so this table sets up its
-- own. Without it the column would only ever hold the time the row was inserted.
drop trigger if exists trg_set_updated_at on public.content_creators;
create trigger trg_set_updated_at before update on public.content_creators
  for each row execute function public.set_updated_at();
