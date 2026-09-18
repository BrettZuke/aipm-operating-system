-- The owner's verdict on every script, captured from the morning email in one click.
--
-- Without it scripts go to the void: you read six, judge all six in your head, and the machine
-- learns nothing, so it pitches the same rejected angles the next morning. This table is the
-- memory of your taste, and it becomes an input to the strategist alongside the Brain.
--
-- Multi-tenant like everything else: agency_id on every row, RLS via is_agency_member, and every
-- (app) read must ALSO filter agency_id explicitly because View-as bypasses RLS.

-- 'to_record' sits between scripted and filming: approved and queued, but not yet being shot.
-- It is a distinct column rather than a reuse of 'filming' so the board separates
-- "I said yes to this" from "I am actively making it".
alter table public.content_cards drop constraint if exists content_cards_stage_check;
alter table public.content_cards add constraint content_cards_stage_check
  check (stage = any (array[
    'ideas'::text, 'unscripted'::text, 'scripted'::text,
    'to_record'::text, 'filming'::text, 'editing'::text, 'posted'::text
  ]));

create table if not exists public.content_feedback (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  card_id uuid not null references public.content_cards(id) on delete cascade,

  -- accepted  = "I will record this"
  -- rejected  = "not for me"
  -- revise    = "close, but fix something"
  verdict text not null check (verdict in ('accepted', 'rejected', 'revise')),

  -- Optional by design: a reject that demands a sentence is a reject you stop bothering to give
  -- after a week, and a silent thumbs-down still carries signal.
  reason text,

  -- Snapshotted so the training signal survives the card being edited or deleted later.
  card_title text,
  card_hook text,
  card_platform text,

  source text not null default 'email',
  created_at timestamptz not null default now(),

  -- One verdict per card. Changing his mind updates rather than double-counting.
  unique (agency_id, card_id)
);

create index if not exists content_feedback_agency_idx
  on public.content_feedback (agency_id, created_at desc);

create index if not exists content_feedback_verdict_idx
  on public.content_feedback (agency_id, verdict);

alter table public.content_feedback enable row level security;

-- File 09 gives every table with an agency_id a generic agency_select / agency_modify pair.
-- On a fresh database that sweep runs before this table exists, so it never sees it; on a
-- re-run of the whole folder it does. Dropping those two names here, before this table's own
-- policies, is what keeps one pass and two passes identical.
drop policy if exists agency_modify on public.content_feedback;
drop policy if exists agency_select on public.content_feedback;

drop policy if exists content_feedback_agency_select on public.content_feedback;
create policy content_feedback_agency_select on public.content_feedback
  for select using (is_agency_member(agency_id));

drop policy if exists content_feedback_agency_modify on public.content_feedback;
create policy content_feedback_agency_modify on public.content_feedback
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
