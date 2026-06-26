-- ============================================================================
-- Webinars + automated SMS reminders.
--
-- Used for: scheduling a webinar, registering attendees (via Typeform / Wjam
-- webhook / manual entry), and auto-firing SMS reminders at T-24h, T-1h,
-- T-15min, and "starting now" via /api/cron/webinar-reminders.
-- ============================================================================

create table if not exists public.webinars (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,

  -- External system IDs (for sync / dedupe)
  webinarjam_event_id text,
  zoom_meeting_id text,

  -- Attendee join link — substituted into reminder templates as {join_url}
  join_url text,

  -- SMS templates per reminder window. {name}, {title}, {minutes}, {join_url} are substituted.
  -- Leave any field NULL to skip that reminder window.
  template_24h text default 'Hey {name} — quick reminder, {title} kicks off in 24 hours. Save a seat: {join_url}',
  template_1h  text default 'Hey {name} — {title} starts in 1 hour. Join here: {join_url}',
  template_15m text default '15 mins until {title} — get set up. Join: {join_url}',
  template_live text default '{title} is starting NOW. Join: {join_url}',

  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webinars_agency_idx  on public.webinars (agency_id, starts_at);

create table if not exists public.webinar_registrations (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,

  name text,
  email text,
  phone text,                       -- E.164 format (+1...) — null = skip SMS

  source text,                      -- 'typeform' | 'webinarjam' | 'manual' | 'csv'
  registered_at timestamptz not null default now(),

  -- Reminder tracking — set to the timestamp when each SMS was successfully sent.
  -- The cron uses these to avoid double-sending.
  sent_24h_at  timestamptz,
  sent_1h_at   timestamptz,
  sent_15m_at  timestamptz,
  sent_live_at timestamptz,

  -- For SMS that errored (Twilio code etc.), track for diagnostics.
  last_send_error text,

  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists webinar_reg_webinar_idx on public.webinar_registrations (webinar_id);
create unique index if not exists webinar_reg_unique_phone on public.webinar_registrations (webinar_id, phone) where phone is not null;
