-- Lead attribution: capture each lead's UTM (keyed by email) so sales from a no-UTM source
-- (e.g. a checkout API that does not return UTM) can still be attributed by source / campaign /
-- content. We capture UTM at opt-in time and join sales to leads by email.

create table if not exists public.lead_attribution (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  email text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_path text,
  referrer text,
  first_touch_at timestamptz not null default now(),
  last_touch_at timestamptz not null default now(),
  touches integer not null default 1,
  created_at timestamptz not null default now()
);

-- email is stored lowercased by the writer; one row per (agency, email).
create unique index if not exists lead_attribution_agency_email_uk
  on public.lead_attribution (agency_id, email);

comment on table public.lead_attribution is
  'First-touch UTM per lead email, captured client-side from example.com opt-ins. Joined to FanBasis buyers by email for sale attribution (FanBasis API carries no UTM).';

-- Atomic upsert that PRESERVES first-touch UTM (only fills a field if it was null) while
-- bumping last_touch_at + touches. Called by the /api/attribution endpoint via service role.
create or replace function public.record_lead_attribution(
  p_agency uuid,
  p_email text,
  p_source text,
  p_medium text,
  p_campaign text,
  p_content text,
  p_term text,
  p_landing text,
  p_referrer text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_attribution as la
    (agency_id, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_path, referrer)
  values
    (p_agency, lower(p_email), nullif(p_source,''), nullif(p_medium,''), nullif(p_campaign,''),
     nullif(p_content,''), nullif(p_term,''), nullif(p_landing,''), nullif(p_referrer,''))
  on conflict (agency_id, email) do update set
    last_touch_at = now(),
    touches       = la.touches + 1,
    utm_source    = coalesce(la.utm_source, excluded.utm_source),
    utm_medium    = coalesce(la.utm_medium, excluded.utm_medium),
    utm_campaign  = coalesce(la.utm_campaign, excluded.utm_campaign),
    utm_content   = coalesce(la.utm_content, excluded.utm_content),
    utm_term      = coalesce(la.utm_term, excluded.utm_term),
    landing_path  = coalesce(la.landing_path, excluded.landing_path),
    referrer      = coalesce(la.referrer, excluded.referrer);
end;
$$;

alter table public.lead_attribution enable row level security;
drop policy if exists lead_attribution_agency_select on public.lead_attribution;
create policy lead_attribution_agency_select on public.lead_attribution for select
  using (public.is_agency_member(agency_id));
drop policy if exists lead_attribution_agency_modify on public.lead_attribution;
create policy lead_attribution_agency_modify on public.lead_attribution for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));
