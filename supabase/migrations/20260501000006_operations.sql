-- ============================================================================
-- Operations: tasks, projects, EOD reports, departments, content, playbooks
-- ============================================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'active',
  start_date date,
  due_date date,
  data jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_agency_idx on public.projects (agency_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  due_date timestamptz,
  completed_at timestamptz,
  data jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id, status);
create index if not exists tasks_agency_idx on public.tasks (agency_id, due_date);

-- EOD report templates (configurable form per agency)
create table if not exists public.eod_form_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  description text,
  fields jsonb not null default '[]',  -- [{key,label,type,required,...}]
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.eod_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  template_id uuid references public.eod_form_templates(id) on delete set null,
  member_id uuid not null references public.profiles(id) on delete cascade,
  report_date date not null default current_date,
  responses jsonb not null default '{}',
  submitted_at timestamptz not null default now()
);
create index if not exists eod_reports_agency_idx on public.eod_reports (agency_id, report_date desc);

-- End-of-Campaign reports
create table if not exists public.eoc_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  summary text,
  data jsonb default '{}',
  submitted_at timestamptz not null default now()
);

create table if not exists public.outreach_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete set null,
  report_date date not null default current_date,
  data jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Departments
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.department_costs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  month date not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'USD'
);

create table if not exists public.department_rhythm (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  cadence text not null,             -- 'daily','weekly','monthly'
  meeting_name text,
  description text,
  data jsonb default '{}'
);

create table if not exists public.department_sops (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  title text not null,
  body_md text,
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  body_md text,
  doc_type text default 'note',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Content calendar
create table if not exists public.content (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  body text,
  content_type text default 'post',
  scheduled_for timestamptz,
  status text default 'draft',
  data jsonb default '{}',
  created_at timestamptz not null default now()
);
