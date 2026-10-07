-- ============================================================================
-- Migration 013: Fix gate event type constraint
--
-- Migration 009 created events_event_type_check allowing only (general, cinema).
-- Migration 012 mistakenly created a DIFFERENTLY-NAMED constraint
-- events_event_type_ck with 3 values, so the old 2-value CHECK was still
-- active and blocked INSERT/UPDATE of event_type = 'gate'.
--
-- This migration:
--   1. Drops BOTH names defensively (any leftover 2-value and 3-value ones).
--   2. Re-creates one canonical CHECK with all three variants: general, cinema, gate.
--   3. Ensures gate_price_text column exists (it should, from 012, but be safe).
--
-- Safe and idempotent: uses DROP CONSTRAINT IF EXISTS, ALTER COLUMN ADD IF NOT EXISTS.
-- ============================================================================
begin;

-- Ensure gate_price_text column (from 012) exists; skip if already present.
alter table public.events add column if not exists gate_price_text text;

-- Ensure the column is plain text before applying a new text-based check.
do $$
declare
  v_kind text;
begin
  select t.typname
    into v_kind
  from information_schema.columns c
  join pg_type t on t.oid = c.data_type::regtype::oid
  where c.table_schema = 'public'
    and c.table_name   = 'events'
    and c.column_name  = 'event_type';

  if coalesce(v_kind, 'text') not in ('text','varchar','bpchar') then
    alter table public.events alter column event_type type text
      using coalesce(event_type::text, 'general');
  end if;
end $$;

-- Drop BOTH naming variants we have produced so far (009 and 012).
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events drop constraint if exists events_event_type_ck;

-- Canonical constraint: the THREE legal values.
alter table public.events
  add constraint events_event_type_check
  check (event_type in ('general', 'cinema', 'gate'));

-- Default + NOT NULL.
alter table public.events
  alter column event_type set default 'general';
update public.events set event_type = 'general' where event_type is null;
alter table public.events
  alter column event_type set not null;

commit;
