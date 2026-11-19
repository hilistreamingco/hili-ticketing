-- ============================================================================
-- Migration 020: Companies, company staff, richer campaigns, creatives page,
-- and the contact-form inbox.
--
-- What this adds:
--
--   1. public.companies        — who sells on the platform (name, logo, contact).
--   2. public.company_staff    — which emails may log in for which company.
--      Never readable from the browser; the API reads it with the service key.
--   3. campaigns               — now belong to a company and carry a banner
--      (photo and/or looping video), an accent colour. The old "max 3 events
--      per campaign" rule is removed.
--   4. events.company_id       — the company an event belongs to (events in a
--      campaign inherit the campaign's company; standalone events can still
--      have none, e.g. Hili's own).
--   5. public.creatives        — the "Creatives we've worked with" page.
--   6. public.contact_messages — what the contact form sends (read in admin).
--
-- Run in Supabase -> SQL Editor, after 019. Safe to run twice.
-- ============================================================================
begin;

-- 1. Companies ---------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  contact_email text,
  created_at timestamptz not null default now()
);
alter table public.companies enable row level security;
drop policy if exists public_read_companies on public.companies;
create policy public_read_companies on public.companies
  for select to anon, authenticated using (true);

-- 2. Company staff (API only: RLS on, no policies) ------------------------------
create table if not exists public.company_staff (
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null check (email = lower(email)),
  created_at timestamptz not null default now(),
  primary key (company_id, email)
);
create index if not exists company_staff_email_idx on public.company_staff (email);
alter table public.company_staff enable row level security;

-- 3. Campaigns: company, banner, accent; drop the 3-event cap -------------------
alter table public.campaigns
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists banner_url text,
  add column if not exists banner_video_url text,
  add column if not exists accent text
    check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$');
create index if not exists campaigns_company_idx on public.campaigns (company_id);

drop trigger if exists trg_campaign_event_limit on public.events;

-- 4. Events: owning company -------------------------------------------------------
alter table public.events
  add column if not exists company_id uuid references public.companies(id) on delete set null;
create index if not exists events_company_idx on public.events (company_id);

-- Events inside a campaign always carry that campaign's company.
create or replace function public.sync_event_company()
returns trigger language plpgsql as $$
begin
  if new.campaign_id is not null then
    select company_id into new.company_id from public.campaigns where id = new.campaign_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_event_company on public.events;
create trigger trg_sync_event_company
  before insert or update of campaign_id on public.events
  for each row execute function public.sync_event_company();

-- 5. Creatives ----------------------------------------------------------------------
create table if not exists public.creatives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  craft text not null default 'Creative',
  work text,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  photo_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists creatives_sort_idx on public.creatives (sort_order, created_at);
alter table public.creatives enable row level security;
drop policy if exists public_read_creatives on public.creatives;
create policy public_read_creatives on public.creatives
  for select to anon, authenticated using (true);

-- 6. Contact inbox (API only) ---------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  contact text not null,
  message text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;

-- Starter companies so existing work has somewhere to live ------------------------------
insert into public.companies (slug, name, contact_email)
values ('prestige-cinemas', 'Prestige Cinemas', null),
       ('hili', 'Hili', 'hilistreaming.co@gmail.com')
on conflict (slug) do nothing;

commit;
