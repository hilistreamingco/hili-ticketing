-- ============================================================
-- Migration 005: Fresh start — email-based auth, no orgs
-- Run this if you have the base schema already (from schema.sql)
-- ============================================================

-- Make organization_id nullable in events (so we don't need orgs table)
alter table public.events alter column organization_id drop not null;

-- Drop the unique slug constraint (we handle collisions server-side with timestamps)
alter table public.events drop constraint if exists events_slug_key;
create unique index if not exists events_slug_unique on public.events(slug);

-- Drop the one_current_event partial index (we clear is_current server-side)
drop index if exists public.one_current_event;

-- Drop organizations and organization_members tables entirely
-- (Drop dependent policies first)
drop policy if exists "admins can view their organization" on public.organizations;
drop policy if exists "admins can view members" on public.organization_members;
drop policy if exists "admins can manage events" on public.events;
drop policy if exists "admins can manage ticket types" on public.ticket_types;
drop policy if exists "admins can view orders" on public.orders;
drop policy if exists "admins can view order items" on public.order_items;
drop policy if exists "admins can view questions" on public.event_questions;
drop policy if exists "admins can view notifications" on public.notifications;
drop policy if exists "admins can view tickets" on public.tickets;

-- Drop helper functions that check org membership
drop function if exists public.is_hili_admin(uuid);
drop function if exists public.end_event(uuid);

-- Drop tables
drop table if exists public.organization_members cascade;
drop table if exists public.organizations cascade;

-- Update events table: remove FK constraint to organizations
alter table if exists public.events drop constraint if exists events_organization_id_fkey;

-- Create simplified RLS policies (service role does writes, authenticated reads ops data)

-- Events + ticket_types: service role manages, anon can read published
drop policy if exists "published events are public" on public.events;
drop policy if exists "visible ticket types are public" on public.ticket_types;

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

-- Operational data: all authenticated users can read (real access control at API layer)
drop policy if exists "ticket owner access is server controlled" on public.tickets;

create policy "authenticated can read orders" on public.orders
  for select to authenticated using (true);

create policy "authenticated can read order items" on public.order_items
  for select to authenticated using (true);

create policy "authenticated can read tickets" on public.tickets
  for select to authenticated using (true);

create policy "authenticated can read notifications" on public.notifications
  for select to authenticated using (true);

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

create policy "service role manages event questions" on public.event_questions
  for all to service_role using (true) with check (true);

-- If you haven't run migration 001 yet, create audit_log table
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete set null,
  action      text not null,
  actor_id    uuid references auth.users(id),
  actor_email text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "authenticated can read audit log" on public.audit_log
  for select to authenticated using (true);

create policy "service role manages audit log" on public.audit_log
  for all to service_role using (true) with check (true);

-- If you haven't run migration 001 yet, create payment_config table
create table if not exists public.payment_config (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  provider       text not null default 'manual'
    check (provider in ('manual', 'daraja', 'pesapal')),
  payment_method text not null default 'mpesa'
    check (payment_method in ('mpesa', 'card', 'bank')),
  payment_type   text not null default 'till'
    check (payment_type in ('till', 'paybill')),
  number         text,
  account_number text,
  instructions   text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.payment_config enable row level security;

create policy "public can read active payment config" on public.payment_config
  for select to anon, authenticated
  using (
    is_active = true and exists (
      select 1 from public.events e where e.id = event_id and e.status = 'published'
    )
  );

create policy "service role manages payment config" on public.payment_config
  for all to service_role using (true) with check (true);

-- Add new columns to orders table if they don't exist (from migration 001)
alter table public.orders
  add column if not exists mpesa_name          text,
  add column if not exists mpesa_transaction_code text,
  add column if not exists payment_provider    text not null default 'manual'
    check (payment_provider in ('manual', 'daraja', 'pesapal')),
  add column if not exists fulfillment_status  text not null default 'not_sent'
    check (fulfillment_status in ('not_sent', 'sent')),
  add column if not exists confirmed_at        timestamptz,
  add column if not exists confirmed_by        uuid references auth.users(id),
  add column if not exists sent_at             timestamptz,
  add column if not exists sent_by             uuid references auth.users(id),
  add column if not exists payment_note        text;

-- Add new payment_status enum values if they don't exist
do $$ begin
  alter type public.payment_status add value if not exists 'confirmed';
  alter type public.payment_status add value if not exists 'not_found';
exception when duplicate_object then null;
end $$;

-- Add indexes
create index if not exists orders_status_idx          on public.orders(status);
create index if not exists orders_fulfillment_idx     on public.orders(fulfillment_status);
create index if not exists orders_event_status_idx    on public.orders(event_id, status);
create index if not exists orders_created_at_idx      on public.orders(created_at desc);
create index if not exists audit_log_order_id_idx     on public.audit_log(order_id);
create index if not exists audit_log_created_at_idx   on public.audit_log(created_at desc);

-- Add to realtime (if not already)
do $$ begin
  alter publication supabase_realtime add table public.payment_config;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.audit_log;
exception when duplicate_object then null;
end $$;

-- Done! Now auth is 100% email-based via ADMIN_EMAILS and PRESTIGE_EMAILS env vars.
