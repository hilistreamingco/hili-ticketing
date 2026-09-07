-- ============================================================
-- Migration 002: Simplified roles (hili_admin + prestige_admin only)
-- and auto-bootstrap helpers.
-- Run AFTER migration 001 in the Supabase SQL editor.
-- ============================================================

-- ── 1. Drop old constraint and replace with 2-role version ───
-- (Safe to run even if 001 already ran — constraint name is the same)
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('hili_admin', 'prestige_admin'));

-- ── 2. Update helper functions ────────────────────────────────

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

-- ── 3. Auto-bootstrap: ensure a default 'Hili' organization exists ─
-- This means admins never see "Create the Hili organization first" errors.
insert into public.organizations (name)
select 'Hili'
where not exists (select 1 from public.organizations where name = 'Hili');

-- ── 4. How to set up users ───────────────────────────────────
--
-- HILI ADMIN (superadmin — full access to everything):
--   1. Create the user in Supabase Auth > Authentication > Users
--   2. Run:
--      insert into public.organization_members (organization_id, user_id, role)
--      select id, 'HILI_USER_UUID'::uuid, 'hili_admin'
--      from public.organizations where name = 'Hili';
--
-- PRESTIGE ADMIN (operations only — orders, payments, tickets):
--   1. Create the user in Supabase Auth > Authentication > Users
--   2. Run:
--      insert into public.organization_members (organization_id, user_id, role)
--      select id, 'PRESTIGE_USER_UUID'::uuid, 'prestige_admin'
--      from public.organizations where name = 'Hili';
--
-- hili_admin can log into BOTH /admin and /admin/prestige.
-- prestige_admin can only log into /admin/prestige.
