-- ============================================================================
-- Wave 1 / H7 — Prevent is_super_admin self-escalation.
--
-- The profiles_self_update RLS policy (20260501000009_rls.sql:43) allows a user
-- to update their OWN profile row with `with check (id = auth.uid())`. RLS WITH
-- CHECK cannot compare against the column's prior value, so any authenticated
-- user could run:
--     update public.profiles set is_super_admin = true where id = auth.uid();
-- and grant themselves super-admin (which gates global ai_role_defaults writes).
--
-- A BEFORE UPDATE trigger closes this: the is_super_admin column is immutable
-- unless the caller is the service role (backend / direct SQL) or is ALREADY a
-- super admin. Normal profile edits (name, theme, timezone) are unaffected
-- because they don't change is_super_admin.
-- ============================================================================

create or replace function public.prevent_super_admin_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Flag unchanged → nothing to guard (normal profile edits pass straight through).
  if new.is_super_admin is not distinct from old.is_super_admin then
    return new;
  end if;

  -- Backend (service-role key) and direct SQL (migrations / Supabase SQL editor,
  -- which carry no JWT role claim) may manage the flag.
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  -- Otherwise the change is only allowed if the CALLER is already a super admin.
  if coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false) then
    return new;
  end if;

  raise exception 'not authorized to change is_super_admin'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_prevent_super_admin_self_escalation on public.profiles;
create trigger trg_prevent_super_admin_self_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_super_admin_self_escalation();
