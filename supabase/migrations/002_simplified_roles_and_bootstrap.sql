-- ============================================================
-- Migration 002: Simplified roles (hili_admin + prestige_admin only)
-- Run in the Supabase SQL editor.
-- ============================================================

-- ── 1. Drop the old constraint FIRST (before any row updates) ─────────────
-- This removes the restriction entirely so the updates in step 2 can run
-- regardless of what the current allowed values are.
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

-- ── 2. Migrate existing rows to new role names ─────────────────────────────
update public.organization_members
  set role = 'hili_admin'
  where role in ('super_admin', 'event_manager', 'finance', 'checkin_staff', 'event_staff', 'hili_admin');

update public.organization_members
  set role = 'prestige_admin'
  where role in ('prestige_staff', 'prestige_admin');

-- ── 3. Add the new simplified constraint ──────────────────────────────────
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('hili_admin', 'prestige_admin'));

-- ── 4. Update helper functions ─────────────────────────────────────────────
create or replace function public.is_hili_admin(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization
      and user_id = auth.uid()
      and role = 'hili_admin'
  );
$$;

create or replace function public.is_prestige_operator(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization
      and user_id = auth.uid()
      and role in ('hili_admin', 'prestige_admin')
  );
$$;

create or replace function public.is_prestige_admin(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization
      and user_id = auth.uid()
      and role in ('hili_admin', 'prestige_admin')
  );
$$;

-- ── 5. Auto-bootstrap: ensure a default 'Hili' organization exists ─────────
insert into public.organizations (name)
select 'Hili'
where not exists (select 1 from public.organizations where name = 'Hili');

-- ── 6. How to assign users ─────────────────────────────────────────────────
--
-- HILI ADMIN (full access — event management + prestige ops):
--   insert into public.organization_members (organization_id, user_id, role)
--   select id, 'YOUR_USER_UUID'::uuid, 'hili_admin'
--   from public.organizations where name = 'Hili';
--
-- PRESTIGE ADMIN (ops only — orders, payments, tickets):
--   insert into public.organization_members (organization_id, user_id, role)
--   select id, 'YOUR_USER_UUID'::uuid, 'prestige_admin'
--   from public.organizations where name = 'Hili';
