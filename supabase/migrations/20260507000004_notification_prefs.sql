-- Add notification preferences to profiles. Single jsonb keyed by feature flag.
-- Defaults: everything off until the user opts in (so we never accidentally email
-- someone who hasn't asked for it).
alter table public.profiles
  add column if not exists notification_preferences jsonb not null default '{}';
