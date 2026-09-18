-- The three roster fields the Content page reads but the first creators migration never created.
--
-- 20260728000000_content_creators.sql built the roster table. The Roster tab then grew three more
-- controls (how deep to scrape, why the creator is on the list, and which lanes they are a model
-- for) and those columns were added straight to a running database instead of being written down
-- here. On a fresh install the table is missing them, the Roster tab asks for columns that do not
-- exist, and Postgres refuses the whole read: the tab comes up empty with no creators and no error
-- on screen, and changing a creator's depth or note returns "column does not exist".
--
-- This adds the three, so a workspace built only from the migrations in this folder matches what
-- the app actually asks for. Safe to run on a database that already has them.
--
-- Apply with the Supabase CLI, or paste into the SQL editor of your project.

-- How many recent posts to pull from this creator on every run. The Roster tab offers Light (25),
-- Normal (50), Deep (100) and Everything (200); 50 is what a newly added creator gets.
alter table public.content_creators
  add column if not exists scrape_limit integer not null default 50;

-- Depth is a deliberate choice, not a free number: the app only ever sends 10 to 200, and a value
-- outside that range would either waste credit or collect too little to judge a creator by.
--
-- If you added this column by hand before running this file, a row could already sit outside that
-- range. Pull those back to the nearest end first, because adding the rule to a table that already
-- breaks it would stop this file halfway and leave you guessing which part ran.
update public.content_creators
  set scrape_limit = least(greatest(scrape_limit, 10), 200)
  where scrape_limit is null or scrape_limit < 10 or scrape_limit > 200;

do $$
begin
  alter table public.content_creators
    add constraint content_creators_scrape_limit_range
    check (scrape_limit between 10 and 200);
exception
  when duplicate_object then null;
end $$;

-- Free text, in the operator's own words, for why this person is on the roster. Read by nobody but
-- the human: it is there so a roster of thirty creators still makes sense in three months.
alter table public.content_creators
  add column if not exists why text;

-- Which lanes this creator is a copy model FOR. Distinct from role: role is how much weight they
-- carry, lanes is what they are worth copying into. NULL means every lane, which is what every row
-- added before this column existed should keep doing.
alter table public.content_creators
  add column if not exists lanes text[] default null;

comment on column public.content_creators.scrape_limit is
  'How many recent posts to pull per run. 25 Light, 50 Normal, 100 Deep, 200 Everything. Defaults to 50.';

comment on column public.content_creators.why is
  'Why this creator is on the roster, in the operator''s own words. Free text, kept short by the form (500 characters).';

comment on column public.content_creators.lanes is
  'Lanes this creator is a copy model for, matching the keys in agency_settings.content_machine.lanes. NULL means all lanes.';

-- Signal is filtered by lane within one workspace, so that is the lookup worth indexing.
create index if not exists content_creators_agency_lanes_idx
  on public.content_creators using gin (lanes)
  where lanes is not null;
