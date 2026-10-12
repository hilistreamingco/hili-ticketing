-- ============================================================================
-- Migration 017: site_settings key/value table for global site toggles.
--
-- What this adds:
--
--   public.site_settings — a simple key/value store for site-wide settings
--   such as maintenance_mode. The public site can READ these settings with
--   the anon key (so the homepage can show an "under construction" screen
--   without an extra API round-trip). WRITES are only allowed through the
--   service role (admin API), never from the browser.
--
--   A default row for maintenance_mode = false is inserted so the setting
--   always exists.
--
-- Run in Supabase → SQL Editor. One transaction.
-- ============================================================================
begin;

create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Public read-only access: anon / authenticated can SELECT every row.
alter table public.site_settings enable row level security;

drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read"
  on public.site_settings for select
  to anon, authenticated
  using (true);

-- Default: maintenance_mode off.
insert into public.site_settings (key, value)
values ('maintenance_mode', 'false'::jsonb)
on conflict (key) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- Post-apply checks:
--
--   select * from public.site_settings;
--
--   -- The admin toggles it via PUT /api/x/admin/site-settings
--   -- (service role writes the row). The public site reads it directly.
-- ---------------------------------------------------------------------------
