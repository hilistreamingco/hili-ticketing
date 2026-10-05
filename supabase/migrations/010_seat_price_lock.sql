-- ============================================================================
-- Migration 010: lock the seat price at hold time, and give the seat map its
-- row offsets. Run AFTER 009. One transaction; nothing applies if it fails.
--
-- Why: a buyer holds seats at the price they see, then pays by M-Pesa. If other
-- buyers push the event into the next price bracket meanwhile, the order must
-- still be charged what the buyer saw and paid. The price is now stored on the
-- hold and used when the order is created (while the hold is still valid).
-- ============================================================================
begin;

alter table public.seat_reservations add column if not exists unit_price_kes integer;

-- ---------------------------------------------------------------------------
-- hold_seats now returns { expires_at, unit_price_kes } instead of a timestamp.
-- ---------------------------------------------------------------------------
drop function if exists public.hold_seats(uuid, uuid[], text, integer);

create function public.hold_seats(
  p_event uuid, p_seat_ids uuid[], p_token text, p_minutes integer default 20
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_exp timestamptz;
  v_max integer;
  v_layout uuid;
  v_type text;
  v_mode text;
  v_price integer;
  sid uuid;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'BAD_TOKEN'; end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  v_exp := now() + make_interval(mins => greatest(1, least(p_minutes, 60)));

  select max_seats_per_order, seat_layout_id, event_type, pricing_mode
    into v_max, v_layout, v_type, v_mode
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

  -- drop expired holds and this buyer's previous hold (re-selecting replaces it)
  delete from public.seat_reservations
  where event_id = p_event and status = 'held' and order_id is null
    and (expires_at <= now() or holder_hash = v_hash);

  if v_mode = 'seats_taken' then
    v_price := public.current_seat_price(p_event, v_hash);
    if v_price is null then raise exception 'NO_PRICE_CONFIGURED'; end if;
  end if;

  foreach sid in array p_seat_ids loop
    begin
      insert into public.seat_reservations (event_id, seat_id, status, holder_hash, expires_at, unit_price_kes)
      values (p_event, sid, 'held', v_hash, v_exp, v_price);
    exception when unique_violation then
      raise exception 'SEAT_TAKEN:%', sid;
    end;
  end loop;

  return jsonb_build_object('expires_at', v_exp, 'unit_price_kes', v_price);
end $$;

grant execute on function public.hold_seats(uuid, uuid[], text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_cinema_order: use the price locked at hold time (seats_taken mode).
-- Same signature as before, so existing grants are kept.
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

-- ---------------------------------------------------------------------------
-- Seat map geometry: rows are drawn right-aligned like the blueprint
-- (SEATING_PLAN_CINEMA_-_1.pdf). "offset" is how many seat widths a row starts
-- in from the left. Row letters and seat counts are unchanged.
-- ---------------------------------------------------------------------------
update public.seat_layouts
   set config = $cfg$
  {
    "rows": [
      {"label": "A", "count": 23, "section": "front", "offset": 1},
      {"label": "B", "count": 23, "section": "front", "offset": 1},
      {"label": "C", "count": 23, "section": "front", "offset": 1},
      {"label": "D", "count": 19, "section": "main",  "offset": 5},
      {"label": "E", "count": 19, "section": "main",  "offset": 5},
      {"label": "F", "count": 19, "section": "main",  "offset": 5},
      {"label": "G", "count": 19, "section": "main",  "offset": 5},
      {"label": "H", "count": 19, "section": "main",  "offset": 5},
      {"label": "J", "count": 19, "section": "main",  "offset": 5},
      {"label": "K", "count": 19, "section": "main",  "offset": 5},
      {"label": "L", "count": 27, "section": "back",  "offset": 0}
    ],
    "aisle_after_row": "C",
    "screen": "front",
    "exits": [
      {"name": "Fire escape", "position": "front-left"},
      {"name": "Entrance", "position": "back-left"}
    ]
  }
  $cfg$::jsonb
 where slug = 'cinema-1';

commit;

-- Check afterwards:
--   select count(*) from seats;                                   -- still 229
--   select config -> 'rows' -> 0 from seat_layouts where slug = 'cinema-1';  -- has "offset": 1
