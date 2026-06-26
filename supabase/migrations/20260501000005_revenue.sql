-- ============================================================================
-- Sales / revenue: transactions, deals, campaigns, offers, quotas, goals, calls
-- ============================================================================

-- Workspace-wide transactions (a superset that includes client_transactions)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  member_id uuid references public.profiles(id) on delete set null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  kind transaction_kind not null default 'payment',
  description text,
  occurred_at timestamptz not null default now(),
  external_id text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);
create index if not exists transactions_agency_idx on public.transactions (agency_id, occurred_at desc);
create index if not exists transactions_member_idx on public.transactions (member_id, occurred_at desc);

-- Sales pipeline
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  stage text not null default 'new',
  amount numeric(12,2) default 0,
  currency text not null default 'USD',
  expected_close_date date,
  closed_at timestamptz,
  data jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_agency_idx on public.deals (agency_id);

-- Marketing/sales campaigns
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  status campaign_status not null default 'draft',
  start_date date,
  end_date date,
  budget numeric(12,2) default 0,
  data jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Paid ad campaigns (separate sub-domain from marketing campaigns)
create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  platform text not null,             -- 'meta', 'google', 'tiktok', etc.
  name text not null,
  status campaign_status not null default 'draft',
  budget_cents bigint default 0,
  spend_cents bigint default 0,
  data jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Productized offers / SKUs
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null,
  currency text not null default 'USD',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Goals (team / individual)
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  target_value numeric not null default 0,
  current_value numeric not null default 0,
  unit text default 'currency',
  period_start date,
  period_end date,
  data jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Sales quotas per member
create table if not exists public.quotas (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  period text not null default 'month',  -- 'month', 'quarter', 'year'
  target_amount numeric(12,2) not null,
  currency text not null default 'USD',
  effective_date date not null default current_date
);

-- Commission rules
create table if not exists public.commission_assignments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  rate_pct numeric(5,2) not null default 0,
  applies_to text not null default 'all',
  effective_date date not null default current_date,
  data jsonb default '{}'
);

-- Saved reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  query jsonb not null default '{}',
  visualization text not null default 'table',
  created_at timestamptz not null default now()
);

-- Calls (CRM-imported or recorded)
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  member_id uuid references public.profiles(id) on delete set null,
  external_id text,
  occurred_at timestamptz not null default now(),
  duration_sec int default 0,
  outcome text,
  notes text,
  data jsonb default '{}'
);

create table if not exists public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  url text not null,
  transcript text,
  summary text,
  created_at timestamptz not null default now()
);
