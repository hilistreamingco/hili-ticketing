-- ============================================================================
-- Migration 011: second poster column + cinema order / seat cleanup after 24h
-- Run after 010. One transaction.
--
--   1. events.poster2_path  — general events can optionally show a second poster.
--   2. cleanup_stale_cinema_orders(p_hours integer default 24)
--        Cancels pending/processing cinema orders older than N hours AND
--        removes any attached seat_reservations so seats are available again.
--        Safe to call repeatedly (idempotent). Returns count of cancelled orders.
--   3. get_taken_seats(p_event uuid)  — used by the client to discover which
--        seats are unavailable. Same shape as the table query the client did
--        before, but it ALSO hides the held seat_reservations whose parent
--        order is older than 24h and still pending. Buyers always see the
--        correct availability even if the cleanup RPC hasn't run yet.
-- ============================================================================
begin;

alter table public.events add column if not exists poster2_path text;

-- ---------------------------------------------------------------------------
-- RPC: cancel cinema orders that have been pending / processing for too long,
-- and release the seat_reservations attached to them so other buyers can sit.
--
-- An order is considered stale when:
--   event_type = 'cinema'
--   and status in ('pending', 'processing')
--   and created_at < now() - interval 'N hours'
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
    return 0;
  end if;

  -- 2. Release the seat hold on every stale order (seats become free for the
  --    next buyer immediately; orders also lose the seat lock).
  delete from public.seat_reservations
   where order_id = any (v_ids)
     and status = 'held';

  -- 3. Cancel the orders. The existing RLS / app trigger behaviour (if any)
  --    already treats cancelled orders as released.
  update public.orders
     set status = 'cancelled',
         payment_note = coalesce(payment_note, 'Auto-cancelled: payment not received within 24 hours.'),
         updated_at = now()
   where id = any (v_ids)
     and status in ('pending', 'processing');

  get diagnostics v_count = row_count;

  -- 4. Audit trail: do not fail the whole cleanup if audit_log is missing or
  --    errors.
  begin
    insert into public.audit_log (order_id, action, actor_id, actor_email, metadata)
    select id,
           'auto_cancelled_stale',
           null,
           'system@hili.local',
           jsonb_build_object('reason', 'cinema pending older than 24h', 'cutoff', v_cutoff)
    from unnest(v_ids) as id;
  exception when others then
    null;
  end;

  return v_count;
end $$;

grant execute on function public.cleanup_stale_cinema_orders(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get the taken seat map for a cinema event. Mirrors the rows the client
-- used to read from seat_reservations, but with built-in awareness of stale
-- pending orders so buyers never stare at "taken" seats that are actually free.
--
--   statuses: 'held' | 'sold' | 'blocked'
-- A seat is NOT shown as taken when:
--   * status = 'held' AND order_id is not null (it's tied to a real order)
--     AND the order is pending/processing AND created_at > 24h ago = STALE HELD
-- ---------------------------------------------------------------------------
create or replace function public.get_taken_seats(p_event uuid)
returns table (seat_id uuid, status text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_old timestamptz := now() - interval '24 hours';
begin
  return query
  select sr.seat_id, sr.status
  from public.seat_reservations sr
  where sr.event_id = p_event
    and not (
          sr.status = 'held'
      and sr.order_id is not null
      and exists (
            select 1 from public.orders o
             where o.id = sr.order_id
               and o.status in ('pending', 'processing')
               and o.created_at < v_old
          )
    );
end $$;

grant execute on function public.get_taken_seats(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Housekeeping: make sure updated_at exists on orders (the cancel above writes
-- it but if the column was missing this adds it).
do $$ begin
  alter table public.orders add column if not exists updated_at timestamptz;
exception when duplicate_column then null; end $$;

commit;
