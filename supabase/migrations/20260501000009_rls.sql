-- ============================================================================
-- Row-level security policies — multi-tenant isolation
-- Pattern: a row is visible if the calling user is an active agency_member
--          of the agency_id on that row. Writes additionally require admin.
-- ============================================================================

-- Helper: enable RLS + standard agency-scoped policy on a table with agency_id
create schema if not exists private;
create or replace function private.enable_agency_rls(_table text)
returns void as $$
begin
  execute format('alter table public.%I enable row level security', _table);
  execute format(
    'drop policy if exists agency_select on public.%I; '
    'create policy agency_select on public.%I for select '
    'using (public.is_agency_member(agency_id))',
    _table, _table
  );
  execute format(
    'drop policy if exists agency_modify on public.%I; '
    'create policy agency_modify on public.%I for all '
    'using (public.is_agency_member(agency_id)) '
    'with check (public.is_agency_member(agency_id))',
    _table, _table
  );
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- profiles: always visible to self; admins of any shared agency can also see.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select
  using (id = auth.uid()
         or exists (
           select 1 from public.agency_members am1
           join public.agency_members am2 on am1.agency_id = am2.agency_id
           where am1.user_id = auth.uid()
             and am2.user_id = profiles.id
         ));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- accounts: visible/writable only to owner
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
drop policy if exists accounts_owner_all on public.accounts;
create policy accounts_owner_all on public.accounts for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- agencies: visible to all members; mutable by admins
-- ---------------------------------------------------------------------------
alter table public.agencies enable row level security;
drop policy if exists agencies_member_select on public.agencies;
create policy agencies_member_select on public.agencies for select
  using (public.is_agency_member(id));
drop policy if exists agencies_admin_modify on public.agencies;
create policy agencies_admin_modify on public.agencies for all
  using (public.is_agency_admin(id)) with check (public.is_agency_admin(id));

-- ---------------------------------------------------------------------------
-- agency_settings, workspace_ai_settings: agency-scoped
-- ---------------------------------------------------------------------------
alter table public.agency_settings enable row level security;
drop policy if exists agency_settings_member_all on public.agency_settings;
create policy agency_settings_member_all on public.agency_settings for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_admin(agency_id));

alter table public.workspace_ai_settings enable row level security;
drop policy if exists workspace_ai_settings_member_all on public.workspace_ai_settings;
create policy workspace_ai_settings_member_all on public.workspace_ai_settings for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_admin(agency_id));

-- ---------------------------------------------------------------------------
-- agency_members: a user sees their own memberships AND members of their agencies
-- ---------------------------------------------------------------------------
alter table public.agency_members enable row level security;
drop policy if exists agency_members_self_read on public.agency_members;
create policy agency_members_self_read on public.agency_members for select
  using (user_id = auth.uid() or public.is_agency_member(agency_id));
drop policy if exists agency_members_admin_write on public.agency_members;
create policy agency_members_admin_write on public.agency_members for all
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

-- ---------------------------------------------------------------------------
-- Apply standard agency-scoped RLS to every table that has agency_id
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on c.relnamespace = n.oid
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname='public' and c.relkind='r' and a.attname='agency_id'
      and c.relname not in (
        'agencies','agency_settings','agency_members','workspace_ai_settings'
      )
  loop
    perform private.enable_agency_rls(t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Tables without agency_id but tied to it via FK (call_recordings, knowledge_chunks, etc.)
-- ---------------------------------------------------------------------------
alter table public.call_recordings enable row level security;
drop policy if exists call_recordings_via_call on public.call_recordings;
create policy call_recordings_via_call on public.call_recordings for all
  using (exists (
    select 1 from public.calls c
    where c.id = call_recordings.call_id and public.is_agency_member(c.agency_id)
  ));

alter table public.knowledge_chunks enable row level security;
drop policy if exists knowledge_chunks_via_doc on public.knowledge_chunks;
create policy knowledge_chunks_via_doc on public.knowledge_chunks for all
  using (exists (
    select 1 from public.knowledge_docs d
    where d.id = knowledge_chunks.doc_id and public.is_agency_member(d.agency_id)
  ));

alter table public.client_dashboard_configs enable row level security;
drop policy if exists client_dashboard_via_client on public.client_dashboard_configs;
create policy client_dashboard_via_client on public.client_dashboard_configs for all
  using (exists (
    select 1 from public.clients c
    where c.id = client_dashboard_configs.client_id and public.is_agency_member(c.agency_id)
  ));

alter table public.client_hub_links enable row level security;
drop policy if exists client_hub_links_via_client on public.client_hub_links;
create policy client_hub_links_via_client on public.client_hub_links for all
  using (exists (
    select 1 from public.clients c
    where c.id = client_hub_links.client_id and public.is_agency_member(c.agency_id)
  ));

alter table public.client_users enable row level security;
drop policy if exists client_users_via_client on public.client_users;
create policy client_users_via_client on public.client_users for all
  using (exists (
    select 1 from public.clients c
    where c.id = client_users.client_id and public.is_agency_member(c.agency_id)
  ) or user_id = auth.uid());

alter table public.client_integrations enable row level security;
drop policy if exists client_integrations_via_client on public.client_integrations;
create policy client_integrations_via_client on public.client_integrations for all
  using (exists (
    select 1 from public.clients c
    where c.id = client_integrations.client_id and public.is_agency_member(c.agency_id)
  ));

alter table public.settoku_messages enable row level security;
drop policy if exists settoku_messages_via_conv on public.settoku_messages;
create policy settoku_messages_via_conv on public.settoku_messages for all
  using (exists (
    select 1 from public.settoku_conversations c
    where c.id = settoku_messages.conversation_id
      and (c.user_id = auth.uid() or public.is_agency_member(c.agency_id))
  ));

-- Department subtables
alter table public.department_costs enable row level security;
drop policy if exists department_costs_via_dept on public.department_costs;
create policy department_costs_via_dept on public.department_costs for all
  using (exists (
    select 1 from public.departments d
    where d.id = department_costs.department_id and public.is_agency_member(d.agency_id)
  ));

alter table public.department_rhythm enable row level security;
drop policy if exists department_rhythm_via_dept on public.department_rhythm;
create policy department_rhythm_via_dept on public.department_rhythm for all
  using (exists (
    select 1 from public.departments d
    where d.id = department_rhythm.department_id and public.is_agency_member(d.agency_id)
  ));

alter table public.department_sops enable row level security;
drop policy if exists department_sops_via_dept on public.department_sops;
create policy department_sops_via_dept on public.department_sops for all
  using (exists (
    select 1 from public.departments d
    where d.id = department_sops.department_id and public.is_agency_member(d.agency_id)
  ));

-- ai_role_defaults: read-only to all authenticated, write super_admin only
alter table public.ai_role_defaults enable row level security;
drop policy if exists ai_role_defaults_read on public.ai_role_defaults;
create policy ai_role_defaults_read on public.ai_role_defaults for select
  using (auth.uid() is not null);
drop policy if exists ai_role_defaults_admin_write on public.ai_role_defaults;
create policy ai_role_defaults_admin_write on public.ai_role_defaults for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin));

-- custom_roles + role_*_permissions: agency admins
alter table public.custom_roles enable row level security;
drop policy if exists custom_roles_member_select on public.custom_roles;
create policy custom_roles_member_select on public.custom_roles for select
  using (public.is_agency_member(agency_id));
drop policy if exists custom_roles_admin_modify on public.custom_roles;
create policy custom_roles_admin_modify on public.custom_roles for all
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

alter table public.role_page_permissions enable row level security;
drop policy if exists role_page_permissions_via_role on public.role_page_permissions;
create policy role_page_permissions_via_role on public.role_page_permissions for all
  using (exists (
    select 1 from public.custom_roles r
    where r.id = role_page_permissions.custom_role_id
      and public.is_agency_member(r.agency_id)
  ));

alter table public.role_element_permissions enable row level security;
drop policy if exists role_element_permissions_via_role on public.role_element_permissions;
create policy role_element_permissions_via_role on public.role_element_permissions for all
  using (exists (
    select 1 from public.custom_roles r
    where r.id = role_element_permissions.custom_role_id
      and public.is_agency_member(r.agency_id)
  ));

alter table public.role_workspace_access enable row level security;
drop policy if exists role_workspace_access_via_role on public.role_workspace_access;
create policy role_workspace_access_via_role on public.role_workspace_access for all
  using (exists (
    select 1 from public.custom_roles r
    where r.id = role_workspace_access.custom_role_id
      and public.is_agency_member(r.agency_id)
  ));

-- Invitations: admin-managed, anonymous can read by token via edge function
alter table public.invitations enable row level security;
drop policy if exists invitations_admin_modify on public.invitations;
create policy invitations_admin_modify on public.invitations for all
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));
