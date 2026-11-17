-- ============================================================================
-- Migration 018: creator / discount codes.
--
-- A code takes a fixed amount (KES) off an order. It can belong to one event or
-- to every event, can have a usage limit and start / end dates, and is tied to
-- a creator so sales can be reported per creator.
--
-- Safety: every function below is private (service role only). The website's
-- server calls them; browsers cannot. The usage limit is enforced with a row
-- lock, so two buyers cannot both take the last use.
--
-- Run in Supabase -> SQL Editor. One transaction; nothing applies if it fails.
-- ============================================================================
begin;

create table if not exists public.discount_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  creator_name  text not null,
  event_id      uuid references public.events(id) on delete cascade,  -- null = every event
  amount_kes    integer not null check (amount_kes > 0),
  usage_limit   integer check (usage_limit is null or usage_limit > 0),
  uses_count    integer not null default 0 check (uses_count >= 0),
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create unique index if not exists discount_codes_code_key on public.discount_codes (upper(code));
create index if not exists discount_codes_event_idx on public.discount_codes (event_id);

create table if not exists public.discount_redemptions (
  id            uuid primary key default gen_random_uuid(),
  code_id       uuid not null references public.discount_codes(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  event_id      uuid references public.events(id) on delete set null,
  discount_kes  integer not null,
  source        text not null default 'online' check (source in ('online', 'gate')),
  created_at    timestamptz not null default now()
);
create index if not exists discount_redemptions_code_idx on public.discount_redemptions (code_id);

-- Row level security on, no policies: only the service role (our server) can read or write.
alter table public.discount_codes enable row level security;
alter table public.discount_redemptions enable row level security;

alter table public.orders add column if not exists discount_code_id uuid references public.discount_codes(id) on delete set null;
alter table public.orders add column if not exists discount_kes integer not null default 0;

-- ---------------------------------------------------------------------------
-- Why a code cannot be used right now (null = it can).
-- ---------------------------------------------------------------------------
create or replace function public._discount_reason(r public.discount_codes, p_event uuid)
returns text language sql stable as $$
  select case
    when not r.is_active then 'INACTIVE'
    when r.event_id is not null and r.event_id <> p_event then 'WRONG_EVENT'
    when r.starts_at is not null and now() < r.starts_at then 'NOT_STARTED'
    when r.ends_at is not null and now() > r.ends_at then 'EXPIRED'
    when r.usage_limit is not null and r.uses_count >= r.usage_limit then 'USED_UP'
    else null
  end
$$;

-- Read-only check, used for the "code applied" message and the admin checker.
create or replace function public.check_discount(p_code text, p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.discount_codes%rowtype; v_reason text;
begin
  select * into r from public.discount_codes where upper(code) = upper(trim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('valid', false, 'reason', 'NOT_FOUND'); end if;
  v_reason := public._discount_reason(r, p_event);
  if v_reason is not null then return jsonb_build_object('valid', false, 'reason', v_reason); end if;
  return jsonb_build_object('valid', true, 'code_id', r.id, 'code', r.code,
    'amount_kes', r.amount_kes, 'creator', r.creator_name,
    'uses_left', case when r.usage_limit is null then null else r.usage_limit - r.uses_count end);
end $$;

-- Takes one use of a code (locks the row so the limit is exact).
create or replace function public.reserve_discount(p_code text, p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.discount_codes%rowtype; v_reason text;
begin
  select * into r from public.discount_codes
   where upper(code) = upper(trim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'DISCOUNT_INVALID:NOT_FOUND'; end if;
  v_reason := public._discount_reason(r, p_event);
  if v_reason is not null then raise exception 'DISCOUNT_INVALID:%', v_reason; end if;
  update public.discount_codes set uses_count = uses_count + 1 where id = r.id;
  return jsonb_build_object('code_id', r.id, 'code', r.code, 'amount_kes', r.amount_kes, 'creator', r.creator_name);
end $$;

-- Gives a use back (order failed after the use was taken).
create or replace function public.release_discount(p_code_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.discount_codes set uses_count = greatest(uses_count - 1, 0) where id = p_code_id;
$$;

-- Applies a reserved code to an order. Safe to repeat for the same order.
create or replace function public.attach_discount(p_order_number text, p_code_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; c public.discount_codes%rowtype; d integer;
begin
  select * into o from public.orders where order_number = p_order_number for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.discount_code_id is not null then
    return jsonb_build_object('already', true, 'amount_kes', o.amount_kes, 'discount_kes', o.discount_kes);
  end if;
  select * into c from public.discount_codes where id = p_code_id;
  if not found then raise exception 'DISCOUNT_INVALID:NOT_FOUND'; end if;
  d := least(c.amount_kes, o.amount_kes);
  update public.orders
     set amount_kes = amount_kes - d, discount_code_id = c.id, discount_kes = d
   where id = o.id;
  insert into public.discount_redemptions (code_id, order_id, event_id, discount_kes, source)
  values (c.id, o.id, o.event_id, d, 'online');
  return jsonb_build_object('already', false, 'amount_kes', o.amount_kes - d, 'discount_kes', d);
end $$;

-- Gate events have no online checkout: the door person redeems the code here.
create or replace function public.redeem_discount_gate(p_code text, p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  v := public.reserve_discount(p_code, p_event);
  insert into public.discount_redemptions (code_id, event_id, discount_kes, source)
  values ((v ->> 'code_id')::uuid, p_event, (v ->> 'amount_kes')::integer, 'gate');
  return v;
end $$;

-- Per-creator report. p_event null = every code; otherwise that event's codes
-- plus the codes that work on every event. Cancelled / failed / refunded orders
-- do not count.
create or replace function public.discount_report(p_event uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (
    select c.id, c.code, c.creator_name, c.event_id, e.name as event_name,
           c.amount_kes, c.usage_limit, c.uses_count, c.is_active, c.starts_at, c.ends_at, c.created_at,
           coalesce(o.orders_count, 0)::int as orders_count,
           coalesce(o.tickets, 0)::int      as tickets,
           coalesce(o.discount_total, 0)::int as discount_total,
           coalesce(o.net_total, 0)::int    as net_total,
           coalesce(g.gate_uses, 0)::int    as gate_uses
    from public.discount_codes c
    left join public.events e on e.id = c.event_id
    left join lateral (
      select count(*) as orders_count,
             sum((select coalesce(sum(oi.quantity), 0) from public.order_items oi where oi.order_id = ord.id)) as tickets,
             sum(ord.discount_kes) as discount_total,
             sum(ord.amount_kes) as net_total
      from public.orders ord
      where ord.discount_code_id = c.id
        and ord.status::text not in ('cancelled', 'failed', 'refunded')
    ) o on true
    left join lateral (
      select count(*) as gate_uses from public.discount_redemptions r
      where r.code_id = c.id and r.source = 'gate'
    ) g on true
    where p_event is null or c.event_id = p_event or c.event_id is null
  ) t
$$;

-- Private: the website server (service role) only.
revoke all on function public._discount_reason(public.discount_codes, uuid) from public, anon, authenticated;
revoke all on function public.check_discount(text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_discount(text, uuid) from public, anon, authenticated;
revoke all on function public.release_discount(uuid) from public, anon, authenticated;
revoke all on function public.attach_discount(text, uuid) from public, anon, authenticated;
revoke all on function public.redeem_discount_gate(text, uuid) from public, anon, authenticated;
revoke all on function public.discount_report(uuid) from public, anon, authenticated;
grant execute on function public.check_discount(text, uuid) to service_role;
grant execute on function public.reserve_discount(text, uuid) to service_role;
grant execute on function public.release_discount(uuid) to service_role;
grant execute on function public.attach_discount(text, uuid) to service_role;
grant execute on function public.redeem_discount_gate(text, uuid) to service_role;
grant execute on function public.discount_report(uuid) to service_role;

commit;

-- Check afterwards:
--   select count(*) from discount_codes;   -- 0
