-- ============================================================================
-- Clients (the agencies' customers) and client portal
-- ============================================================================

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  email text,
  status client_status not null default 'lead',
  mrr numeric(12,2) default 0,
  total_pending numeric(12,2) default 0,
  start_date date,
  notes text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_agency_idx on public.clients (agency_id);
create index if not exists clients_status_idx on public.clients (agency_id, status);

-- Per-client dashboard layout config
create table if not exists public.client_dashboard_configs (
  client_id uuid primary key references public.clients(id) on delete cascade,
  layout jsonb not null default '{}',
  visible_widgets text[] default '{}',
  updated_at timestamptz not null default now()
);

-- Portal navigation links per client
create table if not exists public.client_hub_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  label text not null,
  url text not null,
  icon text,
  sort_order int not null default 0
);

-- External users with access to a single client portal
create table if not exists public.client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer',
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (client_id, user_id)
);
create index if not exists client_users_user_idx on public.client_users (user_id);

-- Client-specific integrations (e.g. their Stripe, their CRM)
create table if not exists public.client_integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,
  config jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_id, provider)
);

-- Transactions billable to a specific client (subset of agency-wide transactions)
create table if not exists public.client_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  kind transaction_kind not null default 'payment',
  occurred_at timestamptz not null default now(),
  description text,
  metadata jsonb default '{}'
);
create index if not exists client_transactions_client_idx on public.client_transactions (client_id);
