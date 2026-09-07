-- ============================================================
-- Migration 003: Remove hard organization dependency from events.
-- Run in Supabase SQL editor.
-- ============================================================

-- Make organization_id nullable so events can be created without an org row.
alter table public.events
  alter column organization_id drop not null;

-- Drop the unique constraint on slug so duplicate event names don't crash.
-- We now generate unique slugs server-side with a timestamp suffix.
drop index if exists public.events_slug_key;
alter table public.events drop constraint if exists events_slug_key;

-- Re-add as unique but allow us to handle conflicts in application code.
-- (The index is needed for RLS/query performance, constraint is optional)
create unique index if not exists events_slug_unique on public.events(slug);

-- Drop the unique partial index on is_current (prevents more than one current event).
-- We now clear is_current on all others server-side before setting one.
drop index if exists public.one_current_event;

-- Drop RLS policies that reference organization_members (no longer needed for auth).
-- Events are now publicly readable if published; writes go through service role.
drop policy if exists "admins can manage events" on public.events;
drop policy if exists "admins can manage ticket types" on public.ticket_types;
drop policy if exists "admins can view orders" on public.orders;
drop policy if exists "admins and prestige can view orders" on public.orders;
drop policy if exists "admins and prestige can view order items" on public.order_items;
drop policy if exists "admins and prestige can view notifications" on public.notifications;
drop policy if exists "admins and prestige can view tickets" on public.tickets;
drop policy if exists "admins can view tickets" on public.tickets;
drop policy if exists "prestige operators can view audit log" on public.audit_log;

-- Simpler policies: all authenticated users with a valid JWT can read operational data.
-- Real access control is enforced at the API layer via ADMIN_EMAILS / PRESTIGE_EMAILS.
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

-- Events and ticket_types: service role handles writes, anon can read published.
create policy "service role manages events" on public.events
  for all to service_role using (true) with check (true);

create policy "service role manages ticket types" on public.ticket_types
  for all to service_role using (true) with check (true);

-- Keep existing public read policies (they're fine):
-- "published events are public" → anon can read published events
-- "visible ticket types are public" → anon can read visible/active tiers
