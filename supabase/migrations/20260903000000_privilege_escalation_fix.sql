-- Closes an in-workspace privilege escalation, plus two smaller gaps around it.
--
-- What went wrong: 20260501000009_rls.sql walks every table that has an agency_id and gives it a
-- member-level write policy called agency_modify. That list includes invitations and custom_roles.
-- The stricter admin-only policies further down the same file were added WITHOUT dropping the broad
-- one, and Postgres ORs permissive policies together, so the weaker one won. Any active member of a
-- workspace could insert an invitation with role owner using nothing but the public anon key and
-- their own login, accept it, and own the workspace.
--
-- Everything here only takes permissions away. Admins still write through the *_admin_modify
-- policies, members still read through agency_select, and every write path the app actually uses
-- runs through the service role, so nothing legitimate is removed. Safe to run more than once.

begin;

-- The escalation itself.
drop policy if exists agency_modify on public.invitations;
drop policy if exists agency_modify on public.custom_roles;

-- Belt and braces: an invitation may never carry owner, so even a future mis-scoped writer cannot
-- mint one. Owners are set when the workspace is created, never by invitation.
alter table public.invitations drop constraint if exists invitations_role_not_owner;
alter table public.invitations add  constraint invitations_role_not_owner check (role <> 'owner');

-- The role permission tables are reached through their owning custom_role, so they follow the same
-- rule: admins write, nobody else.
drop policy if exists role_element_permissions_via_role on public.role_element_permissions;
create policy role_element_permissions_via_role on public.role_element_permissions for all
  using      (exists (select 1 from public.custom_roles r where r.id = role_element_permissions.custom_role_id and public.is_agency_admin(r.agency_id)))
  with check (exists (select 1 from public.custom_roles r where r.id = role_element_permissions.custom_role_id and public.is_agency_admin(r.agency_id)));

drop policy if exists role_page_permissions_via_role on public.role_page_permissions;
create policy role_page_permissions_via_role on public.role_page_permissions for all
  using      (exists (select 1 from public.custom_roles r where r.id = role_page_permissions.custom_role_id and public.is_agency_admin(r.agency_id)))
  with check (exists (select 1 from public.custom_roles r where r.id = role_page_permissions.custom_role_id and public.is_agency_admin(r.agency_id)));

drop policy if exists role_workspace_access_via_role on public.role_workspace_access;
create policy role_workspace_access_via_role on public.role_workspace_access for all
  using      (exists (select 1 from public.custom_roles r where r.id = role_workspace_access.custom_role_id and public.is_agency_admin(r.agency_id)))
  with check (exists (select 1 from public.custom_roles r where r.id = role_workspace_access.custom_role_id and public.is_agency_admin(r.agency_id)));

-- A member could delete the workspace AI settings row, because USING governs delete as well as
-- select. Members read it, admins change it.
drop policy if exists workspace_ai_settings_member_all on public.workspace_ai_settings;
drop policy if exists workspace_ai_settings_member_select on public.workspace_ai_settings;
create policy workspace_ai_settings_member_select on public.workspace_ai_settings for select
  using (public.is_agency_member(agency_id));
drop policy if exists workspace_ai_settings_admin_write on public.workspace_ai_settings;
create policy workspace_ai_settings_admin_write on public.workspace_ai_settings for all
  using      (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

-- The attribution writer runs with the definer's rights and is called only by the public attribution
-- endpoint through the service role. Execute is held by PUBLIC by default, which signed-in users
-- inherit, so a member could write attribution rows into any workspace by calling it directly.
revoke execute on function public.record_lead_attribution(uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant  execute on function public.record_lead_attribution(uuid,text,text,text,text,text,text,text,text) to service_role;

commit;
