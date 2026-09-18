-- Research: the standout videos feed, the scans that fill it, and the AI work saved on each post.
--
-- What this adds, in plain words. Every post the dashboard reads from a creator you track lands in
-- content_posts with its own numbers and the creator's normal it was measured against, so a small
-- account's breakout counts as much as a big account's. Instagram reads run as background jobs
-- tracked in research_jobs. Scored drafts live in research_drafts, cached creator searches in
-- research_searches, and research_usage is the ledger that holds every daily cap.
--
-- Two rules run through all of it:
--   Every row belongs to one workspace (agency_id), and row-level security only lets members of
--   that workspace read it. Members can read these tables and never write them: every write in the
--   app goes through the server using the service-role key, so a daily cap cannot be given back by
--   deleting a row, and a scan's spend is the spend that happened.
--   Every read in the app also filters agency_id in the query itself, never relying on the policy
--   alone, because the server sometimes reads with the service-role key where policies do not run.
--
-- Additive only. Safe to run twice. Apply with the Supabase CLI, or paste into the SQL editor of
-- your project.

-- The resolved YouTube channel id, cached so reading a channel again costs no extra lookup.
alter table public.content_creators add column if not exists youtube_channel_id text;

-- The smallest number of views (or likes plus comments) a post must have before it can count as a
-- standout for this creator. Null means no floor. It stops a tiny post that happened to triple a
-- tiny normal from filling the feed.
alter table public.content_creators add column if not exists min_score integer;

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  creator_id uuid not null references public.content_creators(id) on delete cascade,
  platform text not null check (platform in ('instagram','youtube')),
  external_id text not null,              -- Instagram short code, YouTube video id
  url text not null,
  kind text not null check (kind in ('reel','carousel','image','short','video')),
  posted_at timestamptz,
  caption text,                           -- Instagram caption, YouTube title
  description text,                       -- YouTube description, first 2,000 characters
  duration_s numeric,
  views bigint,
  likes bigint,
  comments bigint,
  metric text check (metric in ('views','engagement')),
  score bigint,                           -- the number the multiple is worked out on
  baseline bigint,                        -- the creator's own normal it was compared to
  multiple numeric,
  strength numeric,                       -- multiple weighted by reach, for ranking
  is_outlier boolean not null default false,
  thumb_url text,                         -- a permanent copy: storage for Instagram, i.ytimg.com for YouTube
  display_url text,
  media_url text,
  audio_url text,
  image_urls text[],
  media_expires_at timestamptz,
  transcript text,
  breakdown jsonb,
  breakdown_model text,
  analysed_at timestamptz,
  adaptation jsonb,
  adapted_at timestamptz,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, platform, external_id)
);

create index if not exists content_posts_feed_idx
  on public.content_posts (agency_id, is_outlier, posted_at desc);

create index if not exists content_posts_creator_idx
  on public.content_posts (agency_id, creator_id, platform, posted_at desc);

comment on table public.content_posts is
  'Every post read from a tracked creator, with the creator-relative maths that decides whether it is a standout, plus the AI breakdown and Make it yours saved on the same row.';

create table if not exists public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  kind text not null check (kind in ('instagram_scan')),
  purpose text not null default 'scan' check (purpose in ('scan','onboard')),
  mode text not null check (mode in ('full','recent')),
  status text not null check (status in ('starting','running','ingesting','done','failed')),
  apify_run_id text unique,
  token_hint int,                         -- which Apify token started it, a hint for the lookup only
  webhook_token_hash text not null,       -- sha256 of the one-time token in the webhook address
  creator_ids uuid[] not null,
  max_charge_usd numeric not null,
  cost_usd numeric,
  result jsonb,
  error text,
  started_by uuid,
  last_checked_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists research_jobs_agency_idx
  on public.research_jobs (agency_id, created_at desc);

comment on table public.research_jobs is
  'One row per Instagram read: what it was capped at, what it cost, and what it found. Written only by the server.';

create table if not exists public.research_drafts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  input_kind text not null check (input_kind in ('script','video')),
  format text not null check (format in ('reel','short','long')),
  title text,
  hook text,
  script text,
  transcript text,
  duration_s numeric,
  score int check (score between 0 and 100),
  report jsonb,
  model text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists research_drafts_agency_idx
  on public.research_drafts (agency_id, created_at desc);

create table if not exists public.research_searches (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  platform text not null check (platform in ('youtube','instagram')),
  query text not null,                    -- trimmed, lowercased, inner spaces collapsed
  results jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists research_searches_lookup_idx
  on public.research_searches (agency_id, platform, query, created_at desc);

-- The ledger behind every daily cap. Only the functions in the next migration write it, so a cap
-- cannot be given back by deleting rows.
create table if not exists public.research_usage (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  kind text not null check (kind in (
    'manual_scan', 'onboard', 'youtube_refresh', 'breakdown', 'adaptation',
    'script', 'draft_upload', 'draft_score', 'search', 'youtube_search'
  )),
  ref text,
  cost_usd numeric,
  created_at timestamptz not null default now()
);

create index if not exists research_usage_agency_kind_idx
  on public.research_usage (agency_id, kind, created_at desc);

-- Not scoped to one workspace on purpose: the YouTube search allowance belongs to the key, so the
-- guard that protects it counts every workspace's searches together.
create index if not exists research_usage_kind_idx
  on public.research_usage (kind, created_at desc);

comment on table public.research_usage is
  'One row per paid or allowance-limited Research action, reserved before the work runs. This is what every daily cap counts.';

-- Row-level security: members read their own workspace's rows, and nothing more. Every write runs
-- on the server with the service-role key, which policies do not apply to.
--
-- The blanket policies are dropped first. File 09 walks every table that has an agency_id column and
-- gives it a read-and-write policy pair called agency_select and agency_modify. That is right for
-- the rest of the dashboard and wrong here, and because migrations run in filename order this file
-- always runs after it, on a first install and on a re-run alike. Dropping those two names by hand
-- is what keeps these five tables read-only for members whichever way the folder is applied.
do $$
declare t text;
begin
  foreach t in array array['content_posts','research_jobs','research_drafts','research_searches','research_usage'] loop
    execute format('drop policy if exists agency_modify on public.%I', t);
    execute format('drop policy if exists agency_select on public.%I', t);
  end loop;
end $$;

-- The updated_at trigger. File 08 applies one to every table that has an updated_at column,
-- but on a fresh database that sweep runs before this table exists, so this table sets up its
-- own. Without it the column would only ever hold the time the row was inserted.
drop trigger if exists trg_set_updated_at on public.content_posts;
create trigger trg_set_updated_at before update on public.content_posts
  for each row execute function public.set_updated_at();

alter table public.content_posts enable row level security;
drop policy if exists content_posts_agency_select on public.content_posts;
create policy content_posts_agency_select on public.content_posts
  for select using (is_agency_member(agency_id));

alter table public.research_jobs enable row level security;
drop policy if exists research_jobs_agency_select on public.research_jobs;
create policy research_jobs_agency_select on public.research_jobs
  for select using (is_agency_member(agency_id));

alter table public.research_drafts enable row level security;
drop policy if exists research_drafts_agency_select on public.research_drafts;
create policy research_drafts_agency_select on public.research_drafts
  for select using (is_agency_member(agency_id));

alter table public.research_searches enable row level security;
drop policy if exists research_searches_agency_select on public.research_searches;
create policy research_searches_agency_select on public.research_searches
  for select using (is_agency_member(agency_id));

alter table public.research_usage enable row level security;
drop policy if exists research_usage_agency_select on public.research_usage;
create policy research_usage_agency_select on public.research_usage
  for select using (is_agency_member(agency_id));

-- Belt and braces on top of the policies: the signed-in roles have no write grant at all on these
-- tables, so a later migration that copies a read-and-write policy template cannot quietly reopen
-- them.
revoke insert, update, delete, truncate
  on public.content_posts, public.research_jobs, public.research_drafts,
     public.research_searches, public.research_usage
  from anon, authenticated;

-- Storage. Two buckets: cover images, which are public because they are shown on the feed, and
-- draft videos, which are private and deleted as soon as a draft has been scored. No policies on
-- storage.objects: the server writes thumbnails with the service-role key, and a draft video is
-- uploaded through a one-off address the server mints for that one file.
--
-- Guarded, because the storage schema only exists on a Supabase project. On a plain Postgres used
-- to test these migrations there is nothing to insert into, and that is not a failure.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('research-thumbs', 'research-thumbs', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
      ('research-drafts', 'research-drafts', false, 27262976, array['video/mp4', 'video/quicktime', 'video/webm'])
    on conflict (id) do nothing;
  end if;
end $$;
