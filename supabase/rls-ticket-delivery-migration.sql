-- Run once after the original schema.sql in an existing Hili Supabase project.
alter table public.organizations enable row level security;
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.tickets enable row level security;
alter table public.event_questions enable row level security;
alter table public.notifications enable row level security;
alter table public.organization_members enable row level security;

create or replace function public.is_hili_admin(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_organization and user_id = auth.uid() and role in ('super_admin', 'event_manager'));
$$;

drop policy if exists "ticket owner access is server controlled" on public.tickets;
drop policy if exists "admins can view tickets" on public.tickets;
drop policy if exists "admins can view orders" on public.orders;
drop policy if exists "admins can view order items" on public.order_items;
drop policy if exists "admins can view questions" on public.event_questions;
drop policy if exists "admins can view notifications" on public.notifications;
drop policy if exists "organizers can manage their events" on public.events;
drop policy if exists "admins can manage events" on public.events;
drop policy if exists "organizers can manage ticket types" on public.ticket_types;
drop policy if exists "admins can manage ticket types" on public.ticket_types;
drop policy if exists "published events are public" on public.events;
drop policy if exists "visible ticket types are public" on public.ticket_types;

create policy "published events are public" on public.events for select to anon, authenticated using (status = 'published');
create policy "visible ticket types are public" on public.ticket_types for select to anon, authenticated using (is_visible = true and is_active = true and exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));
create policy "admins can manage events" on public.events for all to authenticated using (public.is_hili_admin(organization_id)) with check (public.is_hili_admin(organization_id));
create policy "admins can manage ticket types" on public.ticket_types for all to authenticated using (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id))) with check (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)));
create policy "admins can view tickets" on public.tickets for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)));
create policy "admins can view orders" on public.orders for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)));
create policy "admins can view order items" on public.order_items for select to authenticated using (exists (select 1 from public.orders o join public.events e on e.id = o.event_id where o.id = order_id and public.is_hili_admin(e.organization_id)));
create policy "admins can view questions" on public.event_questions for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and public.is_hili_admin(e.organization_id)));
create policy "admins can view notifications" on public.notifications for select to authenticated using (exists (select 1 from public.orders o join public.events e on e.id = o.event_id where o.id = order_id and public.is_hili_admin(e.organization_id)));

alter table public.tickets add column if not exists attendee_index integer not null default 0;
create unique index if not exists tickets_order_type_attendee_key on public.tickets (order_id, ticket_type_id, attendee_index);

create or replace function public.finalize_paid_order(target_checkout_id text, receipt text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_order public.orders%rowtype;
  item record;
  attendee text;
  index integer;
  created_count integer := 0;
begin
  select * into target_order from public.orders where mpesa_checkout_request_id = target_checkout_id for update;
  if not found then raise exception 'Order not found'; end if;
  if target_order.status = 'paid' then return jsonb_build_object('order_id', target_order.id, 'created', 0, 'already_finalized', true); end if;
  update public.orders set status = 'paid', mpesa_receipt_number = coalesce(receipt, mpesa_receipt_number), paid_at = coalesce(paid_at, now()) where id = target_order.id;
  for item in select * from public.order_items where order_id = target_order.id loop
    for index in 0..item.quantity - 1 loop
      attendee := coalesce(nullif(item.attendee_names ->> index, ''), target_order.purchaser_name);
      insert into public.tickets (order_id, event_id, ticket_type_id, attendee_name, attendee_index, ticket_number) values (target_order.id, target_order.event_id, item.ticket_type_id, attendee, index, public.create_ticket_number()) on conflict (order_id, ticket_type_id, attendee_index) do nothing;
      if found then created_count := created_count + 1; end if;
    end loop;
  end loop;
  insert into public.notifications (order_id, channel, recipient, template, payload)
  select target_order.id, 'email', target_order.purchaser_email, 'ticket_confirmation', jsonb_build_object('order_id', target_order.id)
  where not exists (select 1 from public.notifications where order_id = target_order.id and channel = 'email' and template = 'ticket_confirmation');
  return jsonb_build_object('order_id', target_order.id, 'created', created_count, 'already_finalized', false);
end;
$$;
