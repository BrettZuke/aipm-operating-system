-- ============================================================================
-- Custom roles + permission system
-- ============================================================================

create table if not exists public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (agency_id, name)
);

-- Page-level access (which routes can a role see)
create table if not exists public.role_page_permissions (
  id uuid primary key default gen_random_uuid(),
  custom_role_id uuid not null references public.custom_roles(id) on delete cascade,
  page_key text not null,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  unique (custom_role_id, page_key)
);

-- Element-level access (UI element visibility, e.g. hide commissions widget)
create table if not exists public.role_element_permissions (
  id uuid primary key default gen_random_uuid(),
  custom_role_id uuid not null references public.custom_roles(id) on delete cascade,
  element_key text not null,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  unique (custom_role_id, element_key)
);

-- Workspace-scoped access (multi-workspace assignments)
create table if not exists public.role_workspace_access (
  id uuid primary key default gen_random_uuid(),
  custom_role_id uuid not null references public.custom_roles(id) on delete cascade,
  workspace_scope text not null,   -- 'all', 'specific'
  agency_ids uuid[] default '{}',
  unique (custom_role_id)
);

-- Now we can wire up the FK from agency_members.custom_role_id
alter table public.agency_members
  add constraint agency_members_custom_role_id_fkey
  foreign key (custom_role_id) references public.custom_roles(id) on delete set null;

-- AI defaults per role label (admin/member/viewer/etc.)
create table if not exists public.ai_role_defaults (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  daily_message_limit int,
  monthly_token_limit bigint,
  allowed_models text[] default '{}',
  can_access_knowledge boolean not null default true,
  can_use_actions boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role)
);

-- Per-workspace AI configuration (overrides defaults)
create table if not exists public.workspace_ai_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  default_model text not null default 'gpt-4o-mini',
  brand_voice_doc text,
  knowledge_indexing_enabled boolean not null default true,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
