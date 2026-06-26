-- ============================================================================
-- AI / Intelligence: usage tracking, knowledge base, notifications, activity log
-- ============================================================================

-- Daily AI usage rollups for the credits system
create table if not exists public.ai_usage_daily (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  day date not null default current_date,
  messages_sent int not null default 0,
  tokens_input bigint not null default 0,
  tokens_output bigint not null default 0,
  unique (agency_id, user_id, day)
);
create index if not exists ai_usage_daily_agency_day_idx on public.ai_usage_daily (agency_id, day);

create table if not exists public.ai_usage_hourly (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  hour timestamptz not null,
  messages_sent int not null default 0,
  unique (agency_id, user_id, hour)
);

-- Settoku Chat threads and messages
create table if not exists public.settoku_conversations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settoku_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.settoku_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text,
  data jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Knowledge documents (RAG)
create table if not exists public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  title text not null,
  source_url text,
  source_type text,
  content_text text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.knowledge_docs(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  -- pgvector embedding column intentionally not added here; enable pgvector
  -- and add via a separate migration when you wire up RAG.
  metadata jsonb default '{}'
);

-- AI insights surfaced to users
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- AI suggested actions (one-click actions surfaced to user)
create table if not exists public.suggested_actions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Feedback on AI responses
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  target_type text,                  -- 'settoku_message', 'insight', etc.
  target_id uuid,
  rating int,
  comment text,
  created_at timestamptz not null default now()
);

-- Notifications (in-app)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  link text,
  read_at timestamptz,
  data jsonb default '{}',
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at);

-- Audit log
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  data jsonb default '{}',
  created_at timestamptz not null default now()
);
create index if not exists activity_log_agency_idx on public.activity_log (agency_id, created_at desc);
