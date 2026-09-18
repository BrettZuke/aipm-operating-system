-- The DM-link click log, which the dashboard reads but no migration ever created.
--
-- Your dashboard gives you a redirect link to put in Instagram DM broadcasts:
--   https://your-app.vercel.app/api/dm-click?to=...&e={{ subscriber.email_address }}
-- Someone clicks it, /api/dm-click records the click and sends them on to the real link, and the
-- Creator dashboard later matches those clicks to buyers by email so you can see which DM campaign
-- actually earned the money.
--
-- Without this table the click still works (nobody gets stranded) but nothing is ever recorded:
-- the insert fails quietly by design, and the dashboard shows no DM campaigns at all. It looks like
-- nobody clicked rather than like something is broken, which is the worst way for a feature to fail.
--
-- It holds the email addresses of people who clicked, so it is locked down harder than the rest of
-- the database: row-level security is on and there are NO policies, which means normal signed-in
-- users cannot read it at all. Only the server, using the service-role key, can write or read it.
--
-- Apply with the Supabase CLI, or paste into the SQL editor of your project.

create table if not exists public.dm_link_clicks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  email text not null,
  campaign text not null default 'dm',
  clicked_at timestamptz not null default now()
);

-- The dashboard always asks the same question: this workspace's clicks, newest first.
create index if not exists dm_link_clicks_agency_time_idx
  on public.dm_link_clicks (agency_id, clicked_at desc);

alter table public.dm_link_clicks enable row level security;
-- Deliberately no policies for signed-in users: this table holds subscriber email addresses and is
-- service-role only. The dashboard reads it with the service client, never the user's own client.

comment on table public.dm_link_clicks is
  'Instagram DM-link clicks (email, campaign, time) captured by /api/dm-click, matched to buyers by email for attribution. Service-role only; holds subscriber personal data.';

-- File 09 gives every table with an agency_id a generic agency_select / agency_modify pair. On a
-- fresh database that sweep runs before this table exists. On a re-run of the whole folder it does
-- not, and it would hand every signed-in member of the workspace read access to these email
-- addresses. Dropping those two names here is what keeps this table service-role only however many
-- times the folder is applied.
drop policy if exists agency_modify on public.dm_link_clicks;
drop policy if exists agency_select on public.dm_link_clicks;
