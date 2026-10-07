-- ============================================================================
-- Migration 014: Expired / abandoned seat hold cleanup & visibility fixes
--
-- PROBLEM 1 (the user-facing bug):
--   `get_taken_seats(p_event)` showed expired soft-hold rows (status='held' +
--   order_id is null + expires_at <= now()) as TAKEN forever unless some
--   *other* buyer later called hold_seats() which clears them. That made
--   clicking a seat once, then abandoning checkout, look "taken" permanently.
--
-- PROBLEM 2:
--   If an order was eventually cancelled (manually in admin), its seat_reservations
--   rows (status='held' with order_id set) could still show as taken.
--
-- Fix:
--   1. Rewrite `get_taken_seats` so it *never* lists a seat as taken when:
--        a. it is an expired soft hold (no order, expires_at in the past), OR
--        b. the parent order has been cancelled, OR
--        c. the parent order has been pending/processing longer than 24h.
--      The RPC now also proactively DELETEs the expired / cancelled held rows
--      as a background side-effect so the table stays clean even without a
--      separate cleanup run.
--
--   2. Add `release_expired_seat_holds(p_event uuid default null)` helper that
--      deletes stale seat holds (expired no-order holds, cancelled-order holds,
--      and >24h stale pending holds from old cinema orders) for one event or
--      for the whole DB. Called by the UI and the existing cleanup endpoint.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- Helper: delete stale / abandoned seat_reservations rows that no longer
-- represent a real buyer lock. Returns how many rows were deleted. Safe to
-- call repeatedly (idempotent). p_event is optional – null = whole table.
-- ---------------------------------------------------------------------------
create or replace function public.release_expired_seat_holds(p_event uuid default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_stale_24h timestamptz := now() - interval '24 hours';
  v_ids uuid[];
  v_count integer := 0;
begin
  with stale_rows as (
    select sr.ctid
    from public.seat_reservations sr
    where (p_event is null or sr.event_id = p_event)
      and sr.status = 'held'
      and (
        -- a) Expired anonymous soft hold (started, never converted to an order)
        (sr.order_id is null and sr.expires_at is not null and sr.expires_at <= now())
        -- b) Order was cancelled, so the seat lock is gone
        or exists (
          select 1 from public.orders o
          where o.id = sr.order_id and o.status = 'cancelled'
        )
        -- c) Cinema order has been pending/processing for more than 24h: stale.
        or exists (
          select 1 from public.orders o
          join public.events e on e.id = o.event_id
          where o.id = sr.order_id
            and e.event_type = 'cinema'
            and o.status in ('pending', 'processing')
            and o.created_at < v_stale_24h
        )
      )
  )
  delete from public.seat_reservations sr
  using stale_rows st
  where sr.ctid = st.ctid;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.release_expired_seat_holds(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Rewrite get_taken_seats() so expired soft holds never appear as taken, and
-- cleanup those stale rows at the same time.
--
-- A seat IS shown as taken when:
--   status = 'sold'                 → paid, permanent
--   status = 'blocked'              → admin block, permanent
--   status = 'held' + valid        → real buyer in progress (see below)
--
-- A seat IS NOT shown as taken when:
--   (status='held' AND order_id IS NULL AND (expires_at IS NULL OR expires_at <= now()))
--     OR (status='held' AND parent order = 'cancelled')
--     OR (status='held' AND parent order pending/processing older 24h).
-- ---------------------------------------------------------------------------
create or replace function public.get_taken_seats(p_event uuid)
returns table (seat_id uuid, status text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_old timestamptz := now() - interval '24 hours';
begin
  -- Best-effort cleanup of any rows we already know should not be "taken"
  -- (ignored silently if it fails, the query below hides them anyway).
  begin
    perform public.release_expired_seat_holds(p_event);
  exception when others then
    null;
  end;

  return query
  select sr.seat_id, sr.status
  from public.seat_reservations sr
  where sr.event_id = p_event
    and not (
      sr.status = 'held' and (
        -- Expired anonymous soft hold
        (sr.order_id is null and (sr.expires_at is null or sr.expires_at <= now()))
        -- Order cancelled
        or exists (
          select 1 from public.orders o
          where o.id = sr.order_id and o.status = 'cancelled'
        )
        -- Stale pending cinema order >24h
        or exists (
          select 1 from public.orders o
          join public.events e on e.id = o.event_id
          where o.id = sr.order_id
            and e.event_type = 'cinema'
            and o.status in ('pending', 'processing')
            and o.created_at < v_old
        )
      )
    );
end $$;

grant execute on function public.get_taken_seats(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Keep the order-level cleanup helper from migration 011 but make it also
-- release attached seat_reservations by reusing the new helper.
-- (Just updates the body, same signature, safe to replace.)
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_stale_cinema_orders(p_hours integer default 24)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(hours => greatest(1, p_hours));
  v_ids uuid[];
  v_count integer := 0;
begin
  -- 1. Collect stale order ids first (cinema only).
  select coalesce(array_agg(o.id), '{}')
    into v_ids
  from public.orders o
  join public.events e on e.id = o.event_id
  where e.event_type = 'cinema'
    and o.status in ('pending', 'processing')
    and o.created_at < v_cutoff;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    -- Even with no orders to cancel, try to drop any stale holds so the
    -- seats become available again on screen immediately.
    perform public.release_expired_seat_holds(null);
    return 0;
  end if;

  -- 2. Cancel the orders (and their attached seat locks, via cascade logic).
  update public.orders
     set status = 'cancelled',
         payment_note = coalesce(payment_note, 'Auto-cancelled: payment not received within ' || greatest(1, p_hours) || ' hours.'),
         updated_at = now()
   where id = any (v_ids)
     and status in ('pending', 'processing');

  get diagnostics v_count = row_count;

  -- 3. Audit trail (no-fail).
  begin
    insert into public.audit_log (order_id, action, actor_id, actor_email, metadata)
    select id,
           'auto_cancelled_stale',
           null,
           'system@hili.local',
           jsonb_build_object('reason', 'cinema pending older than ' || greatest(1, p_hours) || ' hours', 'cutoff', v_cutoff)
    from unnest(v_ids) as id;
  exception when others then
    null;
  end;

  -- 4. Drop the attached seat holds (and any others that have gone stale).
  perform public.release_expired_seat_holds(null);

  return v_count;
end $$;

grant execute on function public.cleanup_stale_cinema_orders(integer) to anon, authenticated;

commit;
