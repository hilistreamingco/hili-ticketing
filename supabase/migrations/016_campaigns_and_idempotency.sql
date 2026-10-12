-- ============================================================================
-- Migration 016: Event campaigns (up to 3 events per campaign) + order
-- idempotency for safe retries.
--
-- What this adds:
--
--   1. public.campaigns  — a container for up to 3 related events. Each
--      campaign has its own slug, name, description, poster and status
--      (draft / published / archived). Events outside a campaign keep
--      working exactly as before.
--
--   2. events.campaign_id  — nullable FK to campaigns. Setting it attaches
--      the event to that campaign. A trigger enforces the "max 3 events per
--      campaign" rule at INSERT / UPDATE time.
--
--   3. orders.idempotency_key  — optional client-generated key (e.g. a UUID
--      the checkout page creates once per order attempt). A unique partial
--      index means a second submission of the same key never creates a
--      second order. The create_*_order RPCs now accept p_idempotency_key
--      and, when a duplicate arrives, return the EXISTING order's details
--      instead of erroring. This is what lets the buyer mash "Try again"
--      (or auto-retry on a flaky network) without paying twice.
--
-- Run in Supabase → SQL Editor. One transaction.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Campaigns table
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text,
  description text,
  poster_path text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaigns_status_idx on public.campaigns (status, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- 2. events.campaign_id + max-3-per-campaign enforcement
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
create index if not exists events_campaign_idx on public.events (campaign_id);

create or replace function public.check_campaign_event_limit()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  if new.campaign_id is null then return new; end if;

  select count(*) into v_count
    from public.events
   where campaign_id = new.campaign_id
     and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_count >= 3 then
    raise exception 'A campaign can hold at most 3 events.' using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_campaign_event_limit on public.events;
create trigger trg_campaign_event_limit
  before insert or update of campaign_id on public.events
  for each row execute function public.check_campaign_event_limit();

-- ---------------------------------------------------------------------------
-- 3. Order idempotency
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists idempotency_key text;
create unique index if not exists orders_idempotency_key_key
  on public.orders (idempotency_key)
  where idempotency_key is not null;

-- Helper: load an existing order's public-ish fields so the idempotent-replay
-- path returns the same shape the normal insert path returns.
create or replace function public._existing_order_response(p_order_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order_id',      o.id,
    'order_number',  o.order_number,
    'amount_kes',    o.amount_kes,
    'unit_price_kes', coalesce((oi.unit_price_kes), 0),
    'tier_name',     coalesce((tt.name), null),
    'seat_labels',   coalesce((
      select jsonb_agg(s.label order by s.row_label, s.seat_number)
      from public.seats s
      where s.id in (
        select jsonb_array_elements_text(oi.seat_ids)::uuid
      )
    ), '[]'::jsonb)
  )
  from public.orders o
  left join public.order_items oi on oi.order_id = o.id
  left join public.ticket_types tt on tt.id = oi.ticket_type_id
  where o.id = p_order_id
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. create_tier_order — add p_idempotency_key
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
  p_grace interval default interval '15 minutes',
  p_idempotency_key text default null
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
  v_existing uuid;
begin
  v_n := coalesce(array_length(p_attendee_names, 1), 0);
  if v_n = 0 or v_n > 20 then raise exception 'BAD_ATTENDEES'; end if;
  if exists (select 1 from unnest(p_attendee_names) n where coalesce(length(trim(n)), 0) = 0) then
    raise exception 'BAD_ATTENDEES';
  end if;
  if p_purchaser_email is null or p_purchaser_email !~ '^\S+@\S+\.\S+$' then raise exception 'BAD_EMAIL'; end if;
  if coalesce(length(trim(p_mpesa_name)), 0) = 0 then raise exception 'BAD_MPESA_NAME'; end if;

  -- Idempotency fast path: return the order that already exists for this key.
  if p_idempotency_key is not null then
    select id into v_existing from public.orders where idempotency_key = p_idempotency_key;
    if found then return public._existing_order_response(v_existing); end if;
  end if;

  select * into v_event from public.events where id = p_event and status = 'published';
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if public.event_sales_state(p_event, p_grace) <> 'open' then raise exception 'SALES_CLOSED'; end if;

  select * into v_tier
    from public.ticket_types
   where id = p_ticket_type_id and event_id = p_event
   for update;
  if not found then raise exception 'TIER_NOT_FOUND'; end if;
  if not v_tier.is_active or not v_tier.is_visible then raise exception 'TIER_HIDDEN'; end if;

  if public.tier_state(v_tier.id, p_grace) <> 'on_sale' then raise exception 'TIER_NOT_ON_SALE'; end if;
  if v_n < v_tier.min_per_order or v_n > v_tier.max_per_order then raise exception 'BAD_QUANTITY'; end if;
  if v_tier.quantity_total > 0 then
    v_sold := public.ticket_type_sold(v_tier.id);
    if v_sold + v_n > v_tier.quantity_total then raise exception 'TIER_SOLD_OUT'; end if;
  end if;

  v_amount := v_tier.price_kes * v_n;
  v_code := nullif(upper(trim(coalesce(p_mpesa_code, ''))), '');
  v_number := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  -- If two transactions with the same idempotency_key race here, the unique
  -- index rejects the second insert. Catch that and return the first order.
  begin
    insert into public.orders (
      order_number, event_id, purchaser_name, purchaser_email, purchaser_phone,
      amount_kes, status, payment_provider, mpesa_name, mpesa_transaction_code,
      idempotency_key
    ) values (
      v_number, p_event,
      trim(coalesce(p_purchaser_name, p_attendee_names[1])),
      lower(trim(p_purchaser_email)),
      p_purchaser_phone,
      v_amount, 'pending', 'manual',
      trim(p_mpesa_name), v_code,
      p_idempotency_key
    ) returning id into v_order;
  exception when unique_violation then
    select id into v_order from public.orders where idempotency_key = p_idempotency_key;
    if found then return public._existing_order_response(v_order); end if;
    raise;
  end;

  insert into public.order_items (
    order_id, ticket_type_id, quantity, unit_price_kes, attendee_names, seat_ids
  ) values (
    v_order, v_tier.id, v_n, v_tier.price_kes,
    to_jsonb(array(select trim(n) from unnest(p_attendee_names) n)),
    '[]'::jsonb
  );

  return jsonb_build_object(
    'order_id', v_order, 'order_number', v_number,
    'amount_kes', v_amount, 'unit_price_kes', v_tier.price_kes,
    'tier_name', v_tier.name
  );
end $$;

revoke execute on function public.create_tier_order(uuid, uuid, text[], text, text, text, text, text, interval, text) from public, anon, authenticated;
grant  execute on function public.create_tier_order(uuid, uuid, text[], text, text, text, text, text, interval, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. create_cinema_order — add p_idempotency_key (same signature + new param)
-- ---------------------------------------------------------------------------
create or replace function public.create_cinema_order(
  p_event uuid, p_token text, p_seat_ids uuid[], p_attendee_names text[],
  p_purchaser_name text, p_purchaser_email text, p_purchaser_phone text,
  p_mpesa_name text, p_mpesa_code text, p_ticket_type_id uuid default null,
  p_idempotency_key text default null
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
  v_existing uuid;
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

  -- Idempotency fast path (before we touch any seat state).
  if p_idempotency_key is not null then
    select id into v_existing from public.orders where idempotency_key = p_idempotency_key;
    if found then return public._existing_order_response(v_existing); end if;
  end if;

  delete from public.seat_reservations
  where event_id = p_event and status = 'held' and order_id is null and expires_at <= now();

  if v_mode = 'tiers' then
    if p_ticket_type_id is null then raise exception 'TIER_REQUIRED'; end if;
    select * into v_tier
      from public.ticket_types
     where id = p_ticket_type_id and event_id = p_event
     for update;
    if not found then raise exception 'TIER_NOT_FOUND'; end if;
    if public.tier_state(v_tier.id, interval '20 minutes') <> 'on_sale' then raise exception 'TIER_NOT_ON_SALE'; end if;
    if v_n < v_tier.min_per_order or v_n > v_tier.max_per_order then raise exception 'BAD_QUANTITY'; end if;
    if v_tier.quantity_total > 0
       and public.ticket_type_sold(v_tier.id) + v_n > v_tier.quantity_total then raise exception 'TIER_SOLD_OUT'; end if;
    v_price := v_tier.price_kes;
  else
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

  begin
    insert into public.orders (
      order_number, event_id, purchaser_name, purchaser_email, purchaser_phone,
      amount_kes, status, payment_provider, mpesa_name, mpesa_transaction_code,
      idempotency_key
    ) values (
      v_number, p_event,
      coalesce(nullif(trim(p_purchaser_name), ''), p_attendee_names[1]),
      lower(trim(p_purchaser_email)),
      p_purchaser_phone,
      v_price * v_n, 'pending', 'manual',
      trim(p_mpesa_name), v_code,
      p_idempotency_key
    ) returning id into v_order;
  exception when unique_violation then
    select id into v_order from public.orders where idempotency_key = p_idempotency_key;
    if found then return public._existing_order_response(v_order); end if;
    raise;
  end;

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

revoke execute on function public.create_cinema_order(uuid, text, uuid[], text[], text, text, text, text, text, uuid, text) from public, anon, authenticated;
grant  execute on function public.create_cinema_order(uuid, text, uuid[], text[], text, text, text, text, text, uuid, text) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Post-apply checks:
--
--   select proname from pg_proc
--   where proname in ('create_tier_order','create_cinema_order')
--     and pronamespace = 'public'::regnamespace;
--
--   -- Campaigns are RLS-disabled by default (like events). If you later turn
--   -- RLS on, add policies mirroring the events table.
-- ---------------------------------------------------------------------------
