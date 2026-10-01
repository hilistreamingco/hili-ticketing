-- ============================================================================
-- Migration 009 (revised): multiple events, tiers for every event, cinema seat
-- map, sales closing, seat-based pricing.  SUPERSEDES the earlier 009 file.
--
-- Written against the schema dump you sent (all tables empty at that time).
-- Run in Supabase -> SQL Editor. One transaction: if anything fails, nothing is
-- applied. NOT tested against a live database; if it errors, send me the
-- message and the line it points to.
--
-- Rules baked in (tell me if any is wrong):
--   * Every event (general or cinema) can have tiers: name, price, quantity,
--     sales window (from / to), per-order limits. quantity_total = 0 means
--     "no limit". Sold counts come from live orders, not quantity_sold.
--   * A cinema event prices EITHER by tier ('tiers') OR by how many seats are
--     taken ('seats_taken': the bracket for the next seat sold, same price for
--     every seat in the order; held + sold count, admin-blocked do not).
--   * Sales close automatically at events.sales_close_at, when the event or all
--     tiers are sold out, or when tier windows end. Admin override:
--       auto (default) | open (ignore the closing date) | closed (stop sales).
--   * Buyers already mid-checkout get 20 minutes of grace after a closing time
--     (they paid by M-Pesa before submitting). New holds get no grace.
--   * A seat is soft-held for 20 minutes while the buyer pays. After the order
--     is submitted the seat stays reserved until it is resolved (confirmed =
--     sold; cancelled / not found / refunded = released).
--   * Ticket numbers come from a per-event prefix and counter (SBTB001, CIN001).
--   * Nothing here removes or archives events automatically; the admin does it.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 0. Housekeeping: functions left over from the removed organizations system
-- ---------------------------------------------------------------------------
drop function if exists public.is_prestige_admin(uuid);
drop function if exists public.is_prestige_operator(uuid);

-- ---------------------------------------------------------------------------
-- 1. Seat layouts (fixed, reusable) and their seats
-- ---------------------------------------------------------------------------
create table if not exists public.seat_layouts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.seat_layouts(id) on delete cascade,
  row_label text not null,
  seat_number integer not null check (seat_number > 0),
  label text not null,              -- printed on the ticket, e.g. 'A07'
  section text not null,            -- 'front' | 'main' | 'back'
  constraint seats_layout_row_number_key unique (layout_id, row_label, seat_number),
  constraint seats_layout_label_key unique (layout_id, label)
);

-- Seed "Cinema 1" from SEATING_PLAN_CINEMA_-_1.pdf (229 seats, no row I).
-- Seats are generated from the same config the front end draws from.
do $$
declare
  lid uuid;
  r jsonb;
  cfg jsonb := $cfg$
  {
    "rows": [
      {"label": "A", "count": 23, "section": "front"},
      {"label": "B", "count": 23, "section": "front"},
      {"label": "C", "count": 23, "section": "front"},
      {"label": "D", "count": 19, "section": "main"},
      {"label": "E", "count": 19, "section": "main"},
      {"label": "F", "count": 19, "section": "main"},
      {"label": "G", "count": 19, "section": "main"},
      {"label": "H", "count": 19, "section": "main"},
      {"label": "J", "count": 19, "section": "main"},
      {"label": "K", "count": 19, "section": "main"},
      {"label": "L", "count": 27, "section": "back"}
    ],
    "aisle_after_row": "C",
    "screen": "front",
    "exits": [
      {"name": "Fire escape", "position": "front-left"},
      {"name": "Entrance", "position": "back-right"}
    ]
  }
  $cfg$::jsonb;
begin
  insert into public.seat_layouts (slug, name, config)
  values ('cinema-1', 'Prestige Cinema 1', cfg)
  on conflict (slug) do nothing;

  select id into lid from public.seat_layouts where slug = 'cinema-1';

  for r in select * from jsonb_array_elements(cfg -> 'rows') loop
    insert into public.seats (layout_id, row_label, seat_number, label, section)
    select lid, r ->> 'label', n, (r ->> 'label') || lpad(n::text, 2, '0'), r ->> 'section'
    from generate_series(1, (r ->> 'count')::int) as n
    on conflict do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Events: type, layout, prefix/counter, seats per order, sales controls
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists event_type text not null default 'general',
  add column if not exists seat_layout_id uuid references public.seat_layouts(id),
  add column if not exists ticket_prefix text,
  add column if not exists ticket_counter integer not null default 0,
  add column if not exists max_seats_per_order integer not null default 6,
  add column if not exists sales_close_at timestamptz,
  add column if not exists sales_override text not null default 'auto',
  add column if not exists pricing_mode text not null default 'tiers';

alter table public.events drop constraint if exists events_event_type_check;
alter table public.events add constraint events_event_type_check
  check (event_type in ('general', 'cinema'));

alter table public.events drop constraint if exists events_cinema_needs_layout;
alter table public.events add constraint events_cinema_needs_layout
  check (event_type <> 'cinema' or seat_layout_id is not null);

alter table public.events drop constraint if exists events_ticket_prefix_format;
alter table public.events add constraint events_ticket_prefix_format
  check (ticket_prefix is null or ticket_prefix ~ '^[A-Z0-9]{2,8}$');

alter table public.events drop constraint if exists events_sales_override_check;
alter table public.events add constraint events_sales_override_check
  check (sales_override in ('auto', 'open', 'closed'));

alter table public.events drop constraint if exists events_pricing_mode_check;
alter table public.events add constraint events_pricing_mode_check
  check (pricing_mode in ('tiers', 'seats_taken'));

alter table public.events drop constraint if exists events_seats_taken_needs_cinema;
alter table public.events add constraint events_seats_taken_needs_cinema
  check (pricing_mode = 'tiers' or event_type = 'cinema');

create unique index if not exists events_ticket_prefix_key on public.events (ticket_prefix);

-- Several events on one day is normal: index the listing query.
create index if not exists events_status_date_idx on public.events (status, event_date, start_time);

-- ---------------------------------------------------------------------------
-- 3. Price brackets (cinema, pricing_mode = 'seats_taken')
-- ---------------------------------------------------------------------------
create table if not exists public.event_price_brackets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  from_seat integer not null check (from_seat >= 1),   -- applies once (taken seats + 1) reaches this
  price_kes integer not null check (price_kes >= 0),
  constraint event_price_brackets_event_from_key unique (event_id, from_seat)
);

-- ---------------------------------------------------------------------------
-- 4. Seat reservations = the lock AND the public "taken" list. No personal data.
-- ---------------------------------------------------------------------------
create table if not exists public.seat_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  seat_id uuid not null references public.seats(id),
  status text not null check (status in ('held', 'sold', 'blocked')),
  order_id uuid references public.orders(id) on delete cascade,
  holder_hash text,              -- sha256 of the browser's hold token (never the token)
  expires_at timestamptz,        -- only for soft holds made before an order exists
  created_at timestamptz not null default now(),
  constraint seat_reservations_event_seat_key unique (event_id, seat_id),
  constraint seat_reservations_shape check (
       (status = 'held' and order_id is null and expires_at is not null and holder_hash is not null)
    or (status = 'held' and order_id is not null and expires_at is null)
    or (status = 'sold' and order_id is not null)
    or (status = 'blocked')
  )
);
create index if not exists seat_reservations_order_idx on public.seat_reservations (order_id);
create index if not exists seat_reservations_event_idx on public.seat_reservations (event_id, status);

-- ---------------------------------------------------------------------------
-- 5. Orders, order items and tickets learn about seats
-- ---------------------------------------------------------------------------
alter table public.order_items alter column ticket_type_id drop not null;
alter table public.order_items add column if not exists seat_ids jsonb not null default '[]'::jsonb;

alter table public.tickets alter column ticket_type_id drop not null;
alter table public.tickets add column if not exists seat_id uuid references public.seats(id);
alter table public.tickets add column if not exists seat_label text;
create unique index if not exists tickets_order_seat_key
  on public.tickets (order_id, seat_id) where seat_id is not null;

-- The same M-Pesa code cannot back two live orders.
create unique index if not exists orders_active_mpesa_code_key
  on public.orders (upper(mpesa_transaction_code))
  where mpesa_transaction_code is not null
    and status not in ('cancelled', 'failed', 'not_found', 'refunded');

-- Till name shown on checkout (was hard-coded in CheckoutPage).
alter table public.payment_config add column if not exists till_name text;
-- One payment config per event (the admin screen edits exactly one).
create unique index if not exists payment_config_event_key on public.payment_config (event_id);

-- ---------------------------------------------------------------------------
-- 6. Functions: sold counts, tier / event sales state
-- ---------------------------------------------------------------------------

-- Sold quantity for a tier, ignoring dead orders (pending orders count as sold).
create or replace function public.ticket_type_sold(p_type uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(oi.quantity), 0)::int
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.ticket_type_id = p_type
    and o.status not in ('cancelled', 'failed', 'not_found', 'refunded');
$$;

-- 'on_sale' | 'not_started' | 'ended' | 'sold_out' | 'hidden'
create or replace function public.tier_state(p_tier uuid, p_grace interval default interval '0 minutes')
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare t public.ticket_types%rowtype;
begin
  select * into t from public.ticket_types where id = p_tier;
  if not found or not t.is_active then return 'hidden'; end if;
  if t.sales_start is not null and now() < t.sales_start then return 'not_started'; end if;
  if t.sales_end is not null and now() >= t.sales_end + p_grace then return 'ended'; end if;
  if t.quantity_total > 0 and public.ticket_type_sold(t.id) >= t.quantity_total then return 'sold_out'; end if;
  return 'on_sale';
end $$;

-- 'open' | 'not_started' | 'sold_out' | 'closed'
-- p_grace extends time-based closings (used for buyers already mid-checkout).
-- p_exclude_hash ignores one buyer's own seat holds when counting taken seats.
create or replace function public.event_sales_state(
  p_event uuid,
  p_grace interval default interval '0 minutes',
  p_exclude_hash text default null
) returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
  e public.events%rowtype;
  total_seats integer;
  taken integer;
  t record;
  s text;
  any_not_started boolean := false;
  any_sold_out boolean := false;
begin
  select * into e from public.events where id = p_event;
  if not found or e.status <> 'published' then return 'closed'; end if;
  if e.sales_override = 'closed' then return 'closed'; end if;

  if e.event_type = 'cinema' then
    select count(*) into total_seats from public.seats where layout_id = e.seat_layout_id;
    select count(*) into taken
    from public.seat_reservations r
    where r.event_id = e.id
      and (r.expires_at is null or r.expires_at > now())
      and (p_exclude_hash is null or r.holder_hash is distinct from p_exclude_hash);
    if total_seats - taken <= 0 then return 'sold_out'; end if;
  end if;

  if e.sales_close_at is not null and now() >= e.sales_close_at + p_grace
     and e.sales_override <> 'open' then
    return 'closed';
  end if;

  if e.pricing_mode = 'seats_taken' then
    if not exists (select 1 from public.event_price_brackets where event_id = e.id) then
      return 'closed';   -- no price configured yet
    end if;
    return 'open';
  end if;

  for t in select id from public.ticket_types where event_id = e.id and is_active and is_visible loop
    s := public.tier_state(t.id, p_grace);
    if s = 'on_sale' then return 'open'; end if;
    if s = 'not_started' then any_not_started := true; end if;
    if s = 'sold_out' then any_sold_out := true; end if;
  end loop;
  if any_not_started then return 'not_started'; end if;
  if any_sold_out then return 'sold_out'; end if;
  return 'closed';
end $$;

-- Everything a public event page needs about sales, in one call (null if the
-- event is not published).
create or replace function public.event_sales_overview(p_event uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'state', public.event_sales_state(e.id),
    'sales_close_at', e.sales_close_at,
    'pricing_mode', e.pricing_mode,
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'state', public.tier_state(t.id),
        'remaining', case when t.quantity_total > 0
                          then greatest(0, t.quantity_total - public.ticket_type_sold(t.id))
                          else null end
      ) order by t.sort_order, t.price_kes)
      from public.ticket_types t where t.event_id = e.id and t.is_visible
    ), '[]'::jsonb),
    'seats_total', (select count(*) from public.seats s where s.layout_id = e.seat_layout_id),
    'seats_taken', (select count(*) from public.seat_reservations r
                    where r.event_id = e.id and (r.expires_at is null or r.expires_at > now()))
  ) into result
  from public.events e
  where e.id = p_event and e.status = 'published';
  return result;
end $$;

-- State for many events at once (listing pages): { "<event id>": "open", ... }
create or replace function public.event_sales_states(p_events uuid[])
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(e.id::text, public.event_sales_state(e.id)), '{}'::jsonb)
  from public.events e
  where e.id = any (p_events) and e.status = 'published';
$$;

-- ---------------------------------------------------------------------------
-- 7. Functions: seat pricing, holds, cinema checkout
-- ---------------------------------------------------------------------------

-- Price for the next seat sold (seats_taken mode). p_exclude_hash lets a
-- buyer's own hold be ignored so the price they saw is the price they pay.
create or replace function public.current_seat_price(p_event uuid, p_exclude_hash text default null)
returns integer
language sql stable security definer
set search_path = public, extensions
as $$
  select b.price_kes
  from public.event_price_brackets b
  where b.event_id = p_event
    and b.from_seat <= 1 + (
      select count(*)
      from public.seat_reservations r
      where r.event_id = p_event
        and r.status in ('held', 'sold')
        and (r.expires_at is null or r.expires_at > now())
        and (p_exclude_hash is null or r.holder_hash is distinct from p_exclude_hash)
    )
  order by b.from_seat desc
  limit 1;
$$;

-- Soft-hold seats while the buyer goes to pay. Re-calling replaces the buyer's
-- previous hold. Raises SALES_CLOSED or SEAT_TAKEN:<seat_id>.
create or replace function public.hold_seats(
  p_event uuid, p_seat_ids uuid[], p_token text, p_minutes integer default 20
) returns timestamptz
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_exp timestamptz;
  v_max integer;
  v_layout uuid;
  v_type text;
  sid uuid;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'BAD_TOKEN'; end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  v_exp := now() + make_interval(mins => greatest(1, least(p_minutes, 60)));

  select max_seats_per_order, seat_layout_id, event_type
    into v_max, v_layout, v_type
  from public.events where id = p_event and status = 'published';
  if not found or v_type <> 'cinema' then raise exception 'EVENT_NOT_SEATED'; end if;

  if public.event_sales_state(p_event, interval '0 minutes', v_hash) <> 'open' then
    raise exception 'SALES_CLOSED';
  end if;

  if coalesce(array_length(p_seat_ids, 1), 0) = 0 or array_length(p_seat_ids, 1) > v_max then
    raise exception 'BAD_SEAT_COUNT';
  end if;
  if (select count(distinct u) from unnest(p_seat_ids) u) <> array_length(p_seat_ids, 1) then
    raise exception 'DUPLICATE_SEAT';
  end if;
  if exists (
    select 1 from unnest(p_seat_ids) u(id)
    left join public.seats s on s.id = u.id and s.layout_id = v_layout
    where s.id is null
  ) then raise exception 'BAD_SEAT'; end if;

  delete from public.seat_reservations
  where event_id = p_event and status = 'held' and order_id is null
    and (expires_at <= now() or holder_hash = v_hash);

  foreach sid in array p_seat_ids loop
    begin
      insert into public.seat_reservations (event_id, seat_id, status, holder_hash, expires_at)
      values (p_event, sid, 'held', v_hash, v_exp);
    exception when unique_violation then
      raise exception 'SEAT_TAKEN:%', sid;
    end;
  end loop;

  return v_exp;
end $$;

create or replace function public.release_seats(p_event uuid, p_token text)
returns void
language sql security definer
set search_path = public, extensions
as $$
  delete from public.seat_reservations
  where event_id = p_event and status = 'held' and order_id is null
    and holder_hash = encode(digest(p_token, 'sha256'), 'hex');
$$;

-- Atomic cinema checkout: validates, prices on the server, creates the order,
-- its item and attaches the seats. Called only by the API (service role).
-- p_ticket_type_id is required when the event's pricing_mode is 'tiers'.
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
  v_order uuid;
  v_number text;
  v_labels text[];
  i integer;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'BAD_TOKEN'; end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select max_seats_per_order, seat_layout_id, event_type, pricing_mode
    into v_max, v_layout, v_type, v_mode
  from public.events where id = p_event and status = 'published';
  if not found or v_type <> 'cinema' then raise exception 'EVENT_NOT_SEATED'; end if;

  -- 20 minutes of grace = the hold length: a buyer who started before closing
  -- and paid by M-Pesa is not turned away.
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
    select * into v_tier from public.ticket_types
    where id = p_ticket_type_id and event_id = p_event;
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
    v_price := public.current_seat_price(p_event, v_hash);
    if v_price is null then raise exception 'NO_PRICE_CONFIGURED'; end if;
  end if;

  v_number := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  insert into public.orders (
    order_number, event_id, purchaser_name, purchaser_email, purchaser_phone,
    amount_kes, status, payment_provider, mpesa_name, mpesa_transaction_code
  ) values (
    v_number, p_event, p_purchaser_name, p_purchaser_email, p_purchaser_phone,
    v_price * v_n, 'pending', 'manual', p_mpesa_name, nullif(upper(trim(p_mpesa_code)), '')
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
        insert into public.seat_reservations (event_id, seat_id, status, order_id)
        values (p_event, p_seat_ids[i], 'held', v_order);
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

-- ---------------------------------------------------------------------------
-- 8. Functions: ticket numbers and ticket generation
-- ---------------------------------------------------------------------------

-- Atomic per-event ticket numbers: SBTB001, SBTB002, ...
create or replace function public.next_ticket_numbers(p_event uuid, p_count integer)
returns text[]
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_prefix text;
  v_end integer;
  out_numbers text[] := '{}';
  n integer;
begin
  if p_count < 1 then return out_numbers; end if;
  update public.events
     set ticket_counter = ticket_counter + p_count
   where id = p_event
  returning ticket_prefix, ticket_counter into v_prefix, v_end;
  if v_prefix is null then raise exception 'EVENT_HAS_NO_TICKET_PREFIX'; end if;
  for n in (v_end - p_count + 1) .. v_end loop
    out_numbers := out_numbers || (v_prefix || lpad(n::text, 3, '0'));
  end loop;
  return out_numbers;
end $$;

-- Creates every ticket for a confirmed order in one transaction (tier or seat).
-- Returns how many were created (0 if they already existed).
create or replace function public.generate_tickets_for_order(p_order uuid)
returns integer
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  o public.orders%rowtype;
  it record;
  idx integer;
  i integer := 0;
  total integer;
  nums text[];
  v_seat uuid;
  v_label text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status not in ('confirmed', 'paid') then raise exception 'ORDER_NOT_CONFIRMED'; end if;
  if exists (select 1 from public.tickets where order_id = p_order) then return 0; end if;

  select coalesce(sum(quantity), 0) into total from public.order_items where order_id = p_order;
  if total = 0 then raise exception 'ORDER_HAS_NO_ITEMS'; end if;

  nums := public.next_ticket_numbers(o.event_id, total);

  for it in select * from public.order_items where order_id = p_order order by id loop
    for idx in 0 .. it.quantity - 1 loop
      i := i + 1;
      v_seat := nullif(it.seat_ids ->> idx, '')::uuid;
      v_label := null;
      if v_seat is not null then
        select label into v_label from public.seats where id = v_seat;
      end if;
      insert into public.tickets (
        order_id, event_id, ticket_type_id, attendee_name, attendee_index,
        ticket_number, seat_id, seat_label
      ) values (
        o.id, o.event_id, it.ticket_type_id,
        coalesce(nullif(it.attendee_names ->> idx, ''), o.purchaser_name),
        idx, nums[i], v_seat, v_label
      );
    end loop;
  end loop;

  return total;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Keep seat reservations in step with order status (app code cannot forget)
-- ---------------------------------------------------------------------------
create or replace function public.sync_seat_reservations()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'failed', 'not_found', 'refunded') then
    delete from public.seat_reservations where order_id = new.id;
  elsif new.status in ('confirmed', 'paid') then
    update public.seat_reservations
       set status = 'sold', expires_at = null, holder_hash = null
     where order_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists orders_sync_seats on public.orders;
create trigger orders_sync_seats
  after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.sync_seat_reservations();

-- ---------------------------------------------------------------------------
-- 10. Function permissions
--     Supabase grants EXECUTE to anon/authenticated by default, so revoke it
--     explicitly on anything only the API (service role) should call.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_cinema_order(uuid, text, uuid[], text[], text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.next_ticket_numbers(uuid, integer) from public, anon, authenticated;
revoke execute on function public.generate_tickets_for_order(uuid) from public, anon, authenticated;
revoke execute on function public.ticket_type_sold(uuid) from public, anon, authenticated;
grant execute on function public.create_cinema_order(uuid, text, uuid[], text[], text, text, text, text, text, uuid) to service_role;
grant execute on function public.next_ticket_numbers(uuid, integer) to service_role;
grant execute on function public.generate_tickets_for_order(uuid) to service_role;
grant execute on function public.ticket_type_sold(uuid) to service_role;

-- The browser may hold/release seats and read prices and sales state directly.
grant execute on function public.hold_seats(uuid, uuid[], text, integer) to anon, authenticated;
grant execute on function public.release_seats(uuid, text) to anon, authenticated;
grant execute on function public.current_seat_price(uuid, text) to anon, authenticated;
grant execute on function public.tier_state(uuid, interval) to anon, authenticated;
grant execute on function public.event_sales_state(uuid, interval, text) to anon, authenticated;
grant execute on function public.event_sales_overview(uuid) to anon, authenticated;
grant execute on function public.event_sales_states(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. Row level security for the new tables
-- ---------------------------------------------------------------------------
alter table public.seat_layouts enable row level security;
alter table public.seats enable row level security;
alter table public.event_price_brackets enable row level security;
alter table public.seat_reservations enable row level security;

drop policy if exists public_read_seat_layouts on public.seat_layouts;
create policy public_read_seat_layouts on public.seat_layouts
  for select to anon, authenticated using (true);

drop policy if exists public_read_seats on public.seats;
create policy public_read_seats on public.seats
  for select to anon, authenticated using (true);

drop policy if exists public_read_price_brackets on public.event_price_brackets;
create policy public_read_price_brackets on public.event_price_brackets
  for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));

-- Taken seats are public (needed to grey them out). Expired soft holds are hidden.
drop policy if exists public_read_seat_reservations on public.seat_reservations;
create policy public_read_seat_reservations on public.seat_reservations
  for select to anon, authenticated
  using (expires_at is null or expires_at > now());

drop policy if exists service_all_seat_layouts on public.seat_layouts;
create policy service_all_seat_layouts on public.seat_layouts for all to service_role using (true) with check (true);
drop policy if exists service_all_seats on public.seats;
create policy service_all_seats on public.seats for all to service_role using (true) with check (true);
drop policy if exists service_all_price_brackets on public.event_price_brackets;
create policy service_all_price_brackets on public.event_price_brackets for all to service_role using (true) with check (true);
drop policy if exists service_all_seat_reservations on public.seat_reservations;
create policy service_all_seat_reservations on public.seat_reservations for all to service_role using (true) with check (true);

-- Live "taken" updates for the seat map
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seat_reservations'
  ) then
    alter publication supabase_realtime add table public.seat_reservations;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Tightening found in the dump (safe: the code already goes through the API)
-- ---------------------------------------------------------------------------
-- Anyone with the public key could insert orders directly, bypassing pricing.
drop policy if exists anon_create_orders on public.orders;

-- Any signed-in Supabase user could upload, overwrite or delete posters.
-- Posters are uploaded by api/admin/upload-poster.ts with the service role.
drop policy if exists "authenticated organizers upload posters" on storage.objects;
drop policy if exists "authenticated organizers update posters" on storage.objects;
drop policy if exists "authenticated organizers delete posters" on storage.objects;

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'event-posters';

commit;

-- ---------------------------------------------------------------------------
-- Sanity checks to run afterwards (each is a separate query):
--   select count(*) from seats;                                   -- 229
--   select row_label, count(*) from seats group by 1 order by 1;  -- A-C 23, D-K 19, L 27
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('hold_seats','create_cinema_order','generate_tickets_for_order',
--                     'event_sales_state','tier_state','event_sales_overview');
-- ---------------------------------------------------------------------------
