-- ============================================================
-- Migration 004: Remove organizations and organization_members entirely.
-- Auth is now email-based (ADMIN_EMAILS / PRESTIGE_EMAILS env vars).
-- Run this in Supabase SQL editor after migration 003.
-- ============================================================

-- Drop all policies and functions that reference organization_members or organizations.

-- Drop policies
drop policy if exists "admins can view their organization" on public.organizations;
drop policy if exists "admins can view members" on public.organization_members;
drop policy if exists "admins can manage events" on public.events;
drop policy if exists "admins can manage ticket types" on public.ticket_types;
drop policy if exists "admins can view orders" on public.orders;
drop policy if exists "admins and prestige can view orders" on public.orders;
drop policy if exists "admins can view order items" on public.order_items;
drop policy if exists "admins and prestige can view order items" on public.order_items;
drop policy if exists "admins can view questions" on public.event_questions;
drop policy if exists "admins can view notifications" on public.notifications;
drop policy if exists "admins and prestige can view notifications" on public.notifications;
drop policy if exists "admins can view tickets" on public.tickets;
drop policy if exists "admins and prestige can view tickets" on public.tickets;
drop policy if exists "prestige operators can view audit log" on public.audit_log;
drop policy if exists "hili admins can manage payment config" on public.payment_config;

-- Drop helper functions that check org membership
drop function if exists public.is_hili_admin(uuid);
drop function if exists public.is_prestige_operator(uuid);
drop function if exists public.is_prestige_admin(uuid);

-- Drop the organization_members table entirely
drop table if exists public.organization_members cascade;

-- Drop the organizations table entirely
drop table if exists public.organizations cascade;

-- Make events.organization_id nullable and remove the FK
alter table if exists public.events drop constraint if exists events_organization_id_fkey;
alter table if exists public.events alter column organization_id drop not null;

-- Update RLS policies to use simpler rules (service role does all writes, authenticated can read ops data)

-- Events + ticket_types: service role manages, anon can read published
create policy "service role manages events" on public.events
  for all to service_role using (true) with check (true);

create policy "published events are public" on public.events
  for select to anon, authenticated using (status = 'published');

create policy "service role manages ticket types" on public.ticket_types
  for all to service_role using (true) with check (true);

create policy "visible ticket types are public" on public.ticket_types
  for select to anon, authenticated
  using (
    is_visible = true and is_active = true
    and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );

-- Operational data: all authenticated users can read (real access control enforced via API auth guards)
create policy "authenticated can read orders" on public.orders
  for select to authenticated using (true);

create policy "authenticated can read order items" on public.order_items
  for select to authenticated using (true);

create policy "authenticated can read tickets" on public.tickets
  for select to authenticated using (true);

create policy "authenticated can read notifications" on public.notifications
  for select to authenticated using (true);

create policy "authenticated can read audit log" on public.audit_log
  for select to authenticated using (true);

create policy "authenticated can read payment config" on public.payment_config
  for select to authenticated using (true);

-- Public can read active payment config for published events
create policy "public can read active payment config" on public.payment_config
  for select to anon
  using (
    is_active = true and exists (
      select 1 from public.events e where e.id = event_id and e.status = 'published'
    )
  );

-- Anon can create orders (buyer checkout flow — validated server-side)
create policy "anon can insert orders" on public.orders
  for insert to anon, authenticated with check (true);

create policy "anon can insert order items" on public.order_items
  for insert to anon, authenticated with check (true);

-- Service role manages everything else
create policy "service role manages orders" on public.orders
  for all to service_role using (true) with check (true);

create policy "service role manages order items" on public.order_items
  for all to service_role using (true) with check (true);

create policy "service role manages tickets" on public.tickets
  for all to service_role using (true) with check (true);

create policy "service role manages notifications" on public.notifications
  for all to service_role using (true) with check (true);

create policy "service role manages audit log" on public.audit_log
  for all to service_role using (true) with check (true);

create policy "service role manages payment config" on public.payment_config
  for all to service_role using (true) with check (true);

create policy "service role manages event questions" on public.event_questions
  for all to service_role using (true) with check (true);

-- Cleanup: drop unique slug constraint if it still exists (we handle collisions server-side now)
drop index if exists public.events_slug_key;
alter table public.events drop constraint if exists events_slug_key;
create unique index if not exists events_slug_unique on public.events(slug);

-- Cleanup: remove one_current_event partial index (we clear is_current server-side)
drop index if exists public.one_current_event;
