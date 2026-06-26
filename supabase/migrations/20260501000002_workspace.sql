-- ============================================================================
-- Workspace foundation: profiles, accounts, agencies, agency_members
-- Multi-tenant root: every business row scopes to agency_id.
-- ============================================================================

-- Extended user profile (1-1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  role text,                       -- workspace-level default role label
  timezone text default 'UTC',
  theme_preference text default 'dark',
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- Billing-level entity. An account can own multiple agencies (workspaces).
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'free',
  intent text,
  can_create_workspaces boolean not null default true,
  billing_currency text not null default 'USD',
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The tenant root.
create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  slug text unique,
  workspace_type text not null default 'agency',
  brand_logo_url text,
  brand_color text default '#3b82f6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-tenant settings (key-value bag for flexibility)
create table if not exists public.agency_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- M-N: which users belong to which agencies, with what role
create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null default 'member',
  status membership_status not null default 'active',
  custom_role_id uuid,             -- FK to custom_roles, set in 03
  ai_access_override boolean,
  invited_by uuid references public.profiles(id),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (agency_id, user_id)
);
create index if not exists agency_members_user_idx on public.agency_members (user_id);
create index if not exists agency_members_agency_idx on public.agency_members (agency_id);

-- Pending invites
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  invited_email text not null,
  role member_role not null default 'member',
  custom_role_id uuid,
  token text not null unique,
  invited_by uuid references public.profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create index if not exists invitations_email_idx on public.invitations (lower(invited_email));
