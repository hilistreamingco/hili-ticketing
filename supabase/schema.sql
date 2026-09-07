create extension if not exists pgcrypto;

create type public.event_status as enum ('draft', 'published', 'archived');
create type public.payment_status as enum ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded');

create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null default 'Hili', created_at timestamptz not null default now());
create table public.events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null unique, name text not null, short_description text, description text, poster_path text, venue text, address text, city text,
  event_date date, start_time time, end_time time, timezone text not null default 'Africa/Nairobi', venue_map_url text, venue_latitude numeric, venue_longitude numeric, status public.event_status not null default 'draft',
  is_current boolean not null default false, theme jsonb not null default '{}'::jsonb, settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_current_event on public.events (is_current) where is_current = true;
create table public.ticket_types (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade, name text not null, description text,
  price_kes integer not null default 0 check (price_kes >= 0), quantity_total integer not null default 0 check (quantity_total >= 0), quantity_sold integer not null default 0 check (quantity_sold >= 0),
  sales_start timestamptz, sales_end timestamptz, min_per_order integer not null default 1, max_per_order integer not null default 6, is_visible boolean not null default true, is_active boolean not null default true, sort_order integer not null default 0
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), order_number text not null unique, event_id uuid not null references public.events(id), purchaser_name text not null, purchaser_email text not null, purchaser_phone text not null,
  amount_kes integer not null check (amount_kes >= 0), status public.payment_status not null default 'pending', mpesa_checkout_request_id text unique, mpesa_receipt_number text, created_at timestamptz not null default now(), paid_at timestamptz
);
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, ticket_type_id uuid not null references public.ticket_types(id), quantity integer not null check (quantity > 0), unit_price_kes integer not null check (unit_price_kes >= 0), attendee_names jsonb not null default '[]'::jsonb);
create table public.tickets (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, event_id uuid not null references public.events(id), ticket_type_id uuid not null references public.ticket_types(id), attendee_name text not null,
  ticket_number text not null unique, qr_token text not null unique default encode(gen_random_bytes(18), 'hex'), checked_in_at timestamptz, created_at timestamptz not null default now()
);
create table public.event_questions (id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade, label text not null, field_key text not null, is_required boolean not null default false, sort_order integer not null default 0);
create table public.notifications (id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id) on delete set null, channel text not null check (channel in ('email', 'sms', 'whatsapp')), recipient text not null, template text not null, payload jsonb not null default '{}'::jsonb, status text not null default 'queued', attempts integer not null default 0, last_error text, sent_at timestamptz, created_at timestamptz not null default now());

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'event_manager', 'finance', 'checkin_staff', 'event_staff')),
  primary key (organization_id, user_id)
);

alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.tickets enable row level security;
alter table public.orders enable row level security;
alter table public.organization_members enable row level security;
alter publication supabase_realtime add table public.events, public.ticket_types, public.tickets;
create policy "published events are public" on public.events for select using (status = 'published');
create policy "visible ticket types are public" on public.ticket_types for select using (is_visible = true and is_active = true);
create policy "ticket owner access is server controlled" on public.tickets for all using (false) with check (false);

create or replace function public.is_hili_admin(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_organization and user_id = auth.uid() and role in ('super_admin', 'event_manager'));
$$;
create policy "admins can view tickets" on public.tickets for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)));
create policy "admins can view orders" on public.orders for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)));
create policy "organizers can manage their events" on public.events for all to authenticated using (public.is_hili_admin(organization_id)) with check (public.is_hili_admin(organization_id));
create policy "organizers can manage ticket types" on public.ticket_types for all to authenticated using (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id))) with check (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)));

insert into storage.buckets (id, name, public) values ('event-posters', 'event-posters', true) on conflict (id) do nothing;
create policy "public can view event posters" on storage.objects for select using (bucket_id = 'event-posters');
create policy "authenticated organizers upload posters" on storage.objects for insert to authenticated with check (bucket_id = 'event-posters');
create policy "authenticated organizers update posters" on storage.objects for update to authenticated using (bucket_id = 'event-posters');
create policy "authenticated organizers delete posters" on storage.objects for delete to authenticated using (bucket_id = 'event-posters');

create or replace function public.create_ticket_number() returns text language sql volatile as $$ select 'HILI-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8)); $$;
create or replace function public.end_event(target_event uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.events where id = target_event and public.is_hili_admin(organization_id)) then raise exception 'Not authorized to end this event'; end if;
  delete from public.events where id = target_event;
end;
$$;

-- Create the first admin in Supabase Auth > Users, then run this with that user's UUID:
-- insert into public.organizations (name) values ('Hili');
-- insert into public.organization_members (organization_id, user_id, role) select id, 'AUTH_USER_UUID_HERE'::uuid, 'super_admin' from public.organizations where name = 'Hili';
