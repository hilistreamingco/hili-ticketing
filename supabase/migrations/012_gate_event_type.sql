-- ============================================================================
-- Migration 012: "Gate" (at-the-gate ticketing) event type + gate_price_text
--
--   1. event_type enum grows to include 'gate' (besides general and cinema).
--        We can't use ALTER TYPE … ADD VALUE inside a transaction block with
--        other DDL on that type, so we:
--          a. rewrite column as text
--          b. drop old enum (if exists with no deps — best effort)
--          c. re-create it with the new variant
--          d. cast the column back.
--        This keeps everything idempotent / rerunnable.
--   2. events.gate_price_text  — freeform text the admin can use to say
--        "Free", "KES 1,000", "KES 500 – 1,500", "At the gate", etc.
--   3. get_taken_seats & cleanup_stale_cinema_orders from migration 011 only
--        applied to cinema, so gate events are simply ignored by them.
-- ============================================================================
begin;

-- 1. gate_price_text column — always addable, regardless of enum state.
alter table public.events add column if not exists gate_price_text text;

-- 2. Safe event_type migration: move the column to text, then re-install enum
--    with 3 values. This works whether the column was already text or enum.
do $$
declare
  v_kind text;
begin
  -- Inspect the column's actual backing type right now
  select t.typname
    into v_kind
  from information_schema.columns c
  join pg_type t on t.oid = c.data_type::regtype::oid
  where c.table_schema = 'public'
    and c.table_name   = 'events'
    and c.column_name  = 'event_type';

  -- Already text or varchar — nothing to tear down, just ensure the column
  -- stays text and we'll set up the check constraint + enum below.
  if coalesce(v_kind, 'text') in ('text','varchar','bpchar') then
    perform 1;
  end if;

  -- Drop legacy (2-variant) enum type if it exists — we'll recreate it wider.
  drop type if exists public.event_type_enum;
exception when others then
  -- Some enums may be attached by default as "event_event_type" etc. We don't
  -- hard-drop because Supabase may already have the column text-based from an
  -- earlier migration.  We proceed and rely on a check constraint.
  null;
end $$;

-- Ensure the column is plain text before constraining.
alter table public.events alter column event_type type text
  using coalesce(event_type::text, 'general');

-- Defensive check — only create the enum type if it does not already exist.
do $$ begin
  create type public.event_type_enum as enum ('general', 'cinema', 'gate');
exception when duplicate_object then null; end $$;

-- Column constraint — any value is valid text but only the three listed pass.
alter table public.events
  drop constraint if exists events_event_type_ck;
alter table public.events
  add constraint events_event_type_ck
  check (event_type in ('general', 'cinema', 'gate'));

-- Default + NOT NULL.
alter table public.events
  alter column event_type set default 'general';
update public.events set event_type = 'general' where event_type is null;
alter table public.events
  alter column event_type set not null;

commit;
