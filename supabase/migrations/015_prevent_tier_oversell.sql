-- ============================================================================
-- Migration 015: eliminate tier (general event + cinema tiers mode) oversell.
--
-- Two concurrency bugs were found:
--
--   1. General/tier events in orderManual.ts ran the "sold + quantity > total"
--      check in the JS handler, then INSERTed orders and order_items in two
--      separate network round-trips. Two concurrent buyers for the last
--      remaining N tickets of a tier could both pass the check and both
--      commit their rows → oversell.
--
--   2. create_cinema_order (tiers mode) did the same stock check inside the
--      Postgres function, but without locking the ticket_types row. Under
--      READ COMMITTED two concurrent transactions both read the same "sold"
--      snapshot, both pass, both commit → same oversell for cinema tiered
--      pricing.
--
-- Fixes:
--
--   (a) New RPC create_tier_order replaces the JS multi-step for general
--       events. Everything — sales-state check, tier-state check, quantity
--       check, sold check, orders insert, order_items insert — happens in
--       ONE server-side transaction. The ticket_types row is locked with
--       SELECT … FOR UPDATE before the stock check, which serializes buyers
--       of the same tier. Cross-tier / cross-event buyers proceed in parallel
--       because they lock different rows.
--
--   (b) create_cinema_order (tiers mode) is re-replaced to do the same
--       SELECT … FOR UPDATE lock on the tier row before the sold check.
--       Signature and grants are unchanged.
--
--   (c) EXECUTE on the new RPC is restricted to service_role (same as
--       create_cinema_order) because it writes orders.
--
-- Run in Supabase → SQL Editor. One transaction.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- (a) Atomic tier-order RPC for general (non-cinema) events
-- ---------------------------------------------------------------------------
create or replace function public.create_tier_order(
  p_event uuid,
  p_ticket_type_id uuid,
  p_attendee_names text[],
  p_purchaser_name text,
  p_purchaser_email text,
  p_purchaser_phone text,
  p_mpesa_name text,
  p_mpesa_code text,
  p_grace interval default interval '15 minutes'
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_n integer;
  v_event public.events%rowtype;
  v_tier public.ticket_types%rowtype;
  v_sold integer;
  v_amount integer;
  v_order uuid;
  v_number text;
  v_code text;
begin
  -- Input shape
  v_n := coalesce(array_length(p_attendee_names, 1), 0);
  if v_n = 0 or v_n > 20 then
    raise exception 'BAD_ATTENDEES';
  end if;
  if exists (select 1 from unnest(p_attendee_names) n where coalesce(length(trim(n)), 0) = 0) then
    raise exception 'BAD_ATTENDEES';
  end if;
  if p_purchaser_email is null or p_purchaser_email !~ '^\S+@\S+\.\S+$' then
    raise exception 'BAD_EMAIL';
  end if;
  if coalesce(length(trim(p_mpesa_name)), 0) = 0 then
    raise exception 'BAD_MPESA_NAME';
  end if;

  -- Event must be published (gate events are allowed through if admin adds
  -- a tier, but event_sales_state below is the real gate).
  select * into v_event from public.events where id = p_event and status = 'published';
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  -- 202 / SALES_CLOSED guard
  if public.event_sales_state(p_event, p_grace) <> 'open' then
    raise exception 'SALES_CLOSED';
  end if;

  -- Tier must belong to this event. ROW LOCK here → serializes same-tier buys.
  -- Cross-tier / cross-event callers block only if they hit the exact same
  -- ticket_types row. After a concurrent txn commits, FOR UPDATE returns the
  -- newly committed version, and ticket_type_sold() (called in the next
  -- statement after the lock is granted, new snapshot) sees its inserts.
  select * into v_tier
    from public.ticket_types
   where id = p_ticket_type_id and event_id = p_event
   for update;
  if not found then raise exception 'TIER_NOT_FOUND'; end if;
  if not v_tier.is_active or not v_tier.is_visible then raise exception 'TIER_HIDDEN'; end if;

  -- Tier window + stock (after the lock, so the snapshot reflects any commit
  -- that happened while we waited).
  if public.tier_state(v_tier.id, p_grace) <> 'on_sale' then
    raise exception 'TIER_NOT_ON_SALE';
  end if;
  if v_n < v_tier.min_per_order or v_n > v_tier.max_per_order then
    raise exception 'BAD_QUANTITY';
  end if;
  if v_tier.quantity_total > 0 then
    v_sold := public.ticket_type_sold(v_tier.id);
    if v_sold + v_n > v_tier.quantity_total then
      raise exception 'TIER_SOLD_OUT';
    end if;
  end if;

  -- Price / amount
  v_amount := v_tier.price_kes * v_n;

  -- Normalise M-Pesa code: uppercase, trimmed, null-if-empty. Duplicate code
  -- is caught by the existing partial unique index on orders (see 009).
  v_code := nullif(upper(trim(coalesce(p_mpesa_code, ''))), '');

  v_number := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  -- Orders + items in one txn: if the items insert fails the orders row is
  -- automatically rolled back too (no orphans, no manual-delete fallback).
  insert into public.orders (
    order_number, event_id, purchaser_name, purchaser_email, purchaser_phone,
    amount_kes, status, payment_provider, mpesa_name, mpesa_transaction_code
  ) values (
    v_number, p_event,
    trim(coalesce(p_purchaser_name, p_attendee_names[1])),
    lower(trim(p_purchaser_email)),
    p_purchaser_phone,
    v_amount, 'pending', 'manual',
    trim(p_mpesa_name), v_code
  ) returning id into v_order;

  insert into public.order_items (
    order_id, ticket_type_id, quantity, unit_price_kes, attendee_names, seat_ids
  ) values (
    v_order, v_tier.id, v_n, v_tier.price_kes,
    to_jsonb(array(select trim(n) from unnest(p_attendee_names) n)),
    '[]'::jsonb
  );

  return jsonb_build_object(
    'order_id',     v_order,
    'order_number', v_number,
    'amount_kes',   v_amount,
    'unit_price_kes', v_tier.price_kes,
    'tier_name',    v_tier.name
  );
end $$;

revoke execute on function public.create_tier_order(
  uuid, uuid, text[], text, text, text, text, text, interval
) from public, anon, authenticated;
grant  execute on function public.create_tier_order(
  uuid, uuid, text[], text, text, text, text, text, interval
) to service_role;

-- ---------------------------------------------------------------------------
-- (b) create_cinema_order — tiers mode now locks the tier row before the
--     sold check. Signature / semantics / grants are otherwise identical to
--     the Migration 010 version, so existing callers keep working.
-- ---------------------------------------------------------------------------
create or replace function public.create_cinema_order(
  p_event uuid, p_token text, p_seat_ids uuid[], p_attendee_names text[],
  p_purchaser_name text, p_purchaser_email text, p_purchaser_phone text,
  p_mpesa_name text, p_mpesa_code text, p_ticket_type_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_max integer;
  v_layout uuid;
  v_type text;
  v_mode text;
  v_tier public.ticket_types%rowtype;
  v_n integer;
  v_price integer;
  v_held integer;
  v_pmin integer;
  v_pmax integer;
  v_order uuid;
  v_number text;
  v_labels text[];
  v_code text;
  i integer;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'BAD_TOKEN'; end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select max_seats_per_order, seat_layout_id, event_type, pricing_mode
    into v_max, v_layout, v_type, v_mode
  from public.events where id = p_event and status = 'published';
  if not found or v_type <> 'cinema' then raise exception 'EVENT_NOT_SEATED'; end if;

  if public.event_sales_state(p_event, interval '20 minutes', v_hash) <> 'open' then
    raise exception 'SALES_CLOSED';
  end if;

  v_n := coalesce(array_length(p_seat_ids, 1), 0);
  if v_n = 0 or v_n > v_max then raise exception 'BAD_SEAT_COUNT'; end if;
  if coalesce(array_length(p_attendee_names, 1), 0) <> v_n then raise exception 'BAD_ATTENDEES'; end if;
  if (select count(distinct u) from unnest(p_seat_ids) u) <> v_n then raise exception 'DUPLICATE_SEAT'; end if;
  if exists (
    select 1 from unnest(p_seat_ids) u(id)
    left join public.seats s on s.id = u.id and s.layout_id = v_layout
    where s.id is null
  ) then raise exception 'BAD_SEAT'; end if;

  -- clear stale soft holds so they cannot block a free seat
  delete from public.seat_reservations
  where event_id = p_event and status = 'held' and order_id is null and expires_at <= now();

  if v_mode = 'tiers' then
    if p_ticket_type_id is null then raise exception 'TIER_REQUIRED'; end if;

    -- ROW LOCK before stock check. Serializes same-tier buyers so the
    -- ticket_type_sold() call below sees any concurrent committed inserts.
    select * into v_tier
      from public.ticket_types
     where id = p_ticket_type_id and event_id = p_event
     for update;
    if not found then raise exception 'TIER_NOT_FOUND'; end if;

    if public.tier_state(v_tier.id, interval '20 minutes') <> 'on_sale' then
      raise exception 'TIER_NOT_ON_SALE';
    end if;
    if v_n < v_tier.min_per_order or v_n > v_tier.max_per_order then
      raise exception 'BAD_QUANTITY';
    end if;
    if v_tier.quantity_total > 0
       and public.ticket_type_sold(v_tier.id) + v_n > v_tier.quantity_total then
      raise exception 'TIER_SOLD_OUT';
    end if;
    v_price := v_tier.price_kes;
  else
    -- price locked when the seats were held (what the buyer saw and paid)
    select count(*), min(unit_price_kes), max(unit_price_kes)
      into v_held, v_pmin, v_pmax
    from public.seat_reservations
    where event_id = p_event and seat_id = any (p_seat_ids)
      and status = 'held' and order_id is null
      and holder_hash = v_hash and expires_at > now();
    if v_held = v_n and v_pmin is not null and v_pmin = v_pmax then
      v_price := v_pmin;
    else
      v_price := public.current_seat_price(p_event, v_hash);
    end if;
    if v_price is null then raise exception 'NO_PRICE_CONFIGURED'; end if;
  end if;

  v_number := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
  v_code   := nullif(upper(trim(coalesce(p_mpesa_code, ''))), '');

  insert into public.orders (
    order_number, event_id, purchaser_name, purchaser_email, purchaser_phone,
    amount_kes, status, payment_provider, mpesa_name, mpesa_transaction_code
  ) values (
    v_number, p_event,
    coalesce(nullif(trim(p_purchaser_name), ''), p_attendee_names[1]),
    lower(trim(p_purchaser_email)),
    p_purchaser_phone,
    v_price * v_n, 'pending', 'manual',
    trim(p_mpesa_name), v_code
  ) returning id into v_order;

  insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_kes, attendee_names, seat_ids)
  values (v_order, v_tier.id, v_n, v_price, to_jsonb(p_attendee_names), to_jsonb(p_seat_ids));

  for i in 1 .. v_n loop
    update public.seat_reservations
       set order_id = v_order, expires_at = null, holder_hash = null
     where event_id = p_event and seat_id = p_seat_ids[i]
       and status = 'held' and order_id is null
       and holder_hash = v_hash and expires_at > now();
    if not found then
      begin
        insert into public.seat_reservations (event_id, seat_id, status, order_id, unit_price_kes)
        values (p_event, p_seat_ids[i], 'held', v_order, v_price);
      exception when unique_violation then
        raise exception 'SEAT_TAKEN:%', p_seat_ids[i];
      end;
    end if;
  end loop;

  select array_agg(s.label order by s.row_label, s.seat_number) into v_labels
  from public.seats s where s.id = any (p_seat_ids);

  return jsonb_build_object(
    'order_id', v_order, 'order_number', v_number,
    'amount_kes', v_price * v_n, 'unit_price_kes', v_price, 'seat_labels', to_jsonb(v_labels)
  );
end $$;

-- Grants were already restricted to service_role back in Migration 009; we
-- just need to confirm the re-created function keeps the same restrictions.
revoke execute on function public.create_cinema_order(
  uuid, text, uuid[], text[], text, text, text, text, text, uuid
) from public, anon, authenticated;
grant  execute on function public.create_cinema_order(
  uuid, text, uuid[], text[], text, text, text, text, text, uuid
) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Post-apply checks (run separately after commit):
--
--   select proname from pg_proc
--   where proname in ('create_tier_order','create_cinema_order')
--     and pronamespace = 'public'::regnamespace;
--
--   -- Concurrency smoke test (two sessions, last-ticket race):
--   -- Session A
--   begin;
--   select * from public.create_tier_order(
--     '<event-id>', '<tier-id-qty=1>',
--     array['Alice'], 'Alice', 'a@example.com', '254700000001',
--     'Alice MPesa', 'SMOKE0001', interval '15 minutes'
--   );
--   -- (don't commit yet)
--   -- Session B — same tier, last ticket → should block then return TIER_SOLD_OUT
--   select * from public.create_tier_order(
--     '<same-event-id>', '<same-tier-id>',
--     array['Bob'], 'Bob', 'b@example.com', '254700000002',
--     'Bob MPesa', 'SMOKE0002', interval '15 minutes'
--   );
--   -- Now commit Session A; Session B should raise TIER_SOLD_OUT.
-- ---------------------------------------------------------------------------
