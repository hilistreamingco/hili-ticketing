-- ============================================================
-- Migration 001: Prestige/BeerBirds manual payment support
-- Run this in the Supabase SQL editor against your project.
-- ============================================================

-- ── 1. New roles ────────────────────────────────────────────
-- Extend the role constraint to include prestige roles.
alter table public.organization_members
  drop constraint organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in (
    'super_admin',
    'hili_admin',
    'event_manager',
    'prestige_admin',
    'prestige_staff',
    'finance',
    'checkin_staff',
    'event_staff'
  ));

-- ── 2. Orders table: new columns ────────────────────────────
-- Manual payment fields
alter table public.orders
  add column if not exists mpesa_name          text,
  add column if not exists mpesa_transaction_code text,
  add column if not exists payment_provider    text not null default 'manual'
    check (payment_provider in ('manual', 'daraja', 'pesapal')),
  -- Fulfillment lifecycle (separate from payment lifecycle)
  add column if not exists fulfillment_status  text not null default 'not_sent'
    check (fulfillment_status in ('not_sent', 'sent')),
  -- Payment verification audit
  add column if not exists confirmed_at        timestamptz,
  add column if not exists confirmed_by        uuid references auth.users(id),
  -- Ticket delivery audit
  add column if not exists sent_at             timestamptz,
  add column if not exists sent_by             uuid references auth.users(id),
  -- Human-readable "not found" / "refunded" states
  add column if not exists payment_note        text;

-- Rename existing payment_status enum values to align with manual flow.
-- The existing enum is: pending, processing, paid, failed, cancelled, refunded
-- We add two new values for manual verification workflow.
alter type public.payment_status add value if not exists 'confirmed';
alter type public.payment_status add value if not exists 'not_found';

-- ── 3. Payment configuration table ──────────────────────────
-- Hili Admin configures payment details per event; shown on checkout.
create table if not exists public.payment_config (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  provider       text not null default 'manual'
    check (provider in ('manual', 'daraja', 'pesapal')),
  payment_method text not null default 'mpesa'
    check (payment_method in ('mpesa', 'card', 'bank')),
  payment_type   text not null default 'till'
    check (payment_type in ('till', 'paybill')),
  number         text,            -- Till number or Paybill number
  account_number text,            -- Account reference (Paybill only)
  instructions   text,            -- Rich-text instructions shown to buyer
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.payment_config enable row level security;

-- ── 4. Audit log table ───────────────────────────────────────
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete set null,
  action      text not null,       -- e.g. 'order_created', 'payment_confirmed', 'ticket_sent'
  actor_id    uuid references auth.users(id),
  actor_email text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- ── 5. Helper functions ──────────────────────────────────────

-- Check if the current user is a Prestige operator (any prestige role)
create or replace function public.is_prestige_operator(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization
      and user_id = auth.uid()
      and role in ('super_admin', 'hili_admin', 'event_manager', 'prestige_admin', 'prestige_staff')
  );
$$;

-- Check if the current user is a Prestige admin or higher
create or replace function public.is_prestige_admin(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization
      and user_id = auth.uid()
      and role in ('super_admin', 'hili_admin', 'prestige_admin')
  );
$$;

-- Update is_hili_admin to also recognize the new 'hili_admin' role alias
create or replace function public.is_hili_admin(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization
      and user_id = auth.uid()
      and role in ('super_admin', 'hili_admin', 'event_manager')
  );
$$;

-- Generate a human-readable order number e.g. HILI-2026-00124
create or replace function public.generate_order_number()
returns text language plpgsql volatile as $$
declare
  seq_val integer;
begin
  -- Use a simple sequence based on total order count + 1
  select coalesce(max(
    case when order_number ~ '^HILI-\d{4}-\d{5}$'
    then (split_part(order_number, '-', 3))::integer
    else 0 end
  ), 0) + 1 into seq_val from public.orders;
  return 'HILI-' || to_char(extract(year from now()), 'FM9999') || '-' || lpad(seq_val::text, 5, '0');
end;
$$;

-- Confirm a manual payment and generate tickets atomically
create or replace function public.confirm_manual_payment(
  target_order_id uuid,
  actor_id        uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_order public.orders%rowtype;
  item         record;
  attendee     text;
  idx          integer;
  created_count integer := 0;
begin
  select * into target_order from public.orders where id = target_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if target_order.status = 'confirmed' then
    return jsonb_build_object('order_id', target_order.id, 'created', 0, 'already_confirmed', true);
  end if;
  if target_order.status not in ('pending', 'processing') then
    raise exception 'Order cannot be confirmed from status: %', target_order.status;
  end if;

  update public.orders
  set
    status       = 'confirmed',
    confirmed_at = now(),
    confirmed_by = actor_id,
    paid_at      = coalesce(paid_at, now())
  where id = target_order.id;

  -- Generate tickets for each attendee
  for item in select * from public.order_items where order_id = target_order.id loop
    for idx in 0..item.quantity - 1 loop
      attendee := coalesce(nullif(item.attendee_names ->> idx, ''), target_order.purchaser_name);
      insert into public.tickets (order_id, event_id, ticket_type_id, attendee_name, attendee_index, ticket_number)
      values (target_order.id, target_order.event_id, item.ticket_type_id, attendee, idx, public.create_ticket_number())
      on conflict (order_id, ticket_type_id, attendee_index) do nothing;
      if found then created_count := created_count + 1; end if;
    end loop;
  end loop;

  -- Queue notification
  insert into public.notifications (order_id, channel, recipient, template, payload)
  select target_order.id, 'email', target_order.purchaser_email, 'ticket_confirmation',
         jsonb_build_object('order_id', target_order.id)
  where not exists (
    select 1 from public.notifications
    where order_id = target_order.id and channel = 'email' and template = 'ticket_confirmation'
  );

  -- Audit log
  insert into public.audit_log (order_id, action, actor_id, metadata)
  values (target_order.id, 'payment_confirmed', actor_id,
    jsonb_build_object('order_number', target_order.order_number, 'amount_kes', target_order.amount_kes));

  return jsonb_build_object('order_id', target_order.id, 'created', created_count, 'already_confirmed', false);
end;
$$;

-- Mark an order's ticket as sent and update fulfillment status
create or replace function public.mark_ticket_sent(
  target_order_id uuid,
  actor_id        uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_order public.orders%rowtype;
begin
  select * into target_order from public.orders where id = target_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if target_order.fulfillment_status = 'sent' then return; end if;
  if target_order.status != 'confirmed' then
    raise exception 'Cannot send ticket for unconfirmed order (status: %)', target_order.status;
  end if;

  update public.orders
  set fulfillment_status = 'sent', sent_at = now(), sent_by = actor_id
  where id = target_order.id;

  insert into public.audit_log (order_id, action, actor_id, metadata)
  values (target_order.id, 'ticket_sent', actor_id,
    jsonb_build_object('order_number', target_order.order_number));
end;
$$;

-- ── 6. RLS policies for new tables ──────────────────────────

-- payment_config: public can read active configs for published events
create policy "public can read active payment config"
  on public.payment_config for select to anon, authenticated
  using (
    is_active = true and exists (
      select 1 from public.events e where e.id = event_id and e.status = 'published'
    )
  );

create policy "hili admins can manage payment config"
  on public.payment_config for all to authenticated
  using (exists (
    select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)
  ))
  with check (exists (
    select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)
  ));

-- audit_log: only admins and prestige operators can read; server-only inserts via service role
create policy "prestige operators can view audit log"
  on public.audit_log for select to authenticated
  using (
    order_id is null or exists (
      select 1 from public.orders o
      join public.events e on e.id = o.event_id
      where o.id = order_id
        and public.is_prestige_operator(e.organization_id)
    )
  );

-- Extend order policies so prestige operators can also read orders
drop policy if exists "admins can view orders" on public.orders;
create policy "admins and prestige can view orders"
  on public.orders for select to authenticated
  using (exists (
    select 1 from public.events e where e.id = event_id
      and public.is_prestige_operator(e.organization_id)
  ));

drop policy if exists "admins can view order items" on public.order_items;
create policy "admins and prestige can view order items"
  on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o join public.events e on e.id = o.event_id
    where o.id = order_id and public.is_prestige_operator(e.organization_id)
  ));

drop policy if exists "admins can view notifications" on public.notifications;
create policy "admins and prestige can view notifications"
  on public.notifications for select to authenticated
  using (exists (
    select 1 from public.orders o join public.events e on e.id = o.event_id
    where o.id = order_id and public.is_prestige_operator(e.organization_id)
  ));

drop policy if exists "admins can view tickets" on public.tickets;
create policy "admins and prestige can view tickets"
  on public.tickets for select to authenticated
  using (exists (
    select 1 from public.events e where e.id = event_id
      and public.is_prestige_operator(e.organization_id)
  ));

-- Allow anon to insert orders (customers placing orders — server validates)
-- Real enforcement happens server-side via service role key
create policy "anon can insert orders"
  on public.orders for insert to anon, authenticated
  with check (true);

create policy "anon can insert order items"
  on public.order_items for insert to anon, authenticated
  with check (true);

-- Add payment_config to realtime
alter publication supabase_realtime add table public.payment_config;

-- ── 7. Add to realtime ───────────────────────────────────────
alter publication supabase_realtime add table public.audit_log;

-- ── 8. Indexes ───────────────────────────────────────────────
create index if not exists orders_status_idx          on public.orders(status);
create index if not exists orders_fulfillment_idx      on public.orders(fulfillment_status);
create index if not exists orders_event_status_idx     on public.orders(event_id, status);
create index if not exists orders_created_at_idx       on public.orders(created_at desc);
create index if not exists audit_log_order_id_idx      on public.audit_log(order_id);
create index if not exists audit_log_created_at_idx    on public.audit_log(created_at desc);

-- ── 9. Seed comment ──────────────────────────────────────────
-- To create a Prestige admin user:
-- 1. Create the user in Supabase Auth > Users
-- 2. Run:
--    insert into public.organization_members (organization_id, user_id, role)
--    select id, 'PRESTIGE_USER_UUID'::uuid, 'prestige_admin'
--    from public.organizations where name = 'Hili';
