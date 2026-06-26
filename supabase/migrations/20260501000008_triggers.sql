-- ============================================================================
-- Triggers: auto-create profile on signup, updated_at maintenance, helpers
-- ============================================================================

-- Reusable updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables with updated_at
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on c.relnamespace = n.oid
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname='public' and c.relkind='r' and a.attname='updated_at'
  loop
    execute format(
      'drop trigger if exists trg_set_updated_at on public.%I; '
      'create trigger trg_set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- On new auth user, create profile + account + first agency
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_account_id uuid;
  new_agency_id  uuid;
  full_name      text := coalesce(new.raw_user_meta_data->>'full_name', new.email);
  account_type   text := coalesce(new.raw_user_meta_data->>'account_type', 'agency');
begin
  -- Profile
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, full_name)
  on conflict (id) do nothing;

  -- Account
  insert into public.accounts (owner_id, plan, intent)
  values (new.id, 'free', account_type)
  returning id into new_account_id;

  -- Agency (default workspace)
  insert into public.agencies (account_id, owner_id, name, workspace_type)
  values (new_account_id, new.id, full_name || '''s Workspace', account_type)
  returning id into new_agency_id;

  -- Membership
  insert into public.agency_members (agency_id, user_id, role, status)
  values (new_agency_id, new.id, 'owner', 'active');

  -- Settings stub
  insert into public.agency_settings (agency_id) values (new_agency_id)
  on conflict (agency_id) do nothing;

  insert into public.workspace_ai_settings (agency_id) values (new_agency_id)
  on conflict (agency_id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Helper: is the calling user a member of the given agency?
create or replace function public.is_agency_member(target_agency uuid)
returns boolean as $$
  select exists (
    select 1 from public.agency_members
    where agency_id = target_agency
      and user_id = auth.uid()
      and status = 'active'
  );
$$ language sql stable security definer set search_path = public;

-- Helper: is the calling user an owner/admin of the given agency?
create or replace function public.is_agency_admin(target_agency uuid)
returns boolean as $$
  select exists (
    select 1 from public.agency_members
    where agency_id = target_agency
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner','admin')
  );
$$ language sql stable security definer set search_path = public;
