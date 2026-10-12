-- =============================================================================
-- Wiwaha OS · Costing, vendor work orders, guest link, portal access window,
-- and the review form on the evening of the last function (D36)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internal costing: our cost next to the price, and what the price book said
-- when the quote was made, so Prashanth sees agreed vs prescribed vs cost.
-- ---------------------------------------------------------------------------
alter table public.price_book_items add column cost_paise bigint check (cost_paise is null or cost_paise >= 0);
alter table public.quote_lines
  add column selection_id uuid references public.wedding_selections(id) on delete set null,
  add column category text;

-- The couple can read their quote lines, so our cost and the prescribed rate
-- live beside them in a table only Prashanth and accounts can read.
create table public.quote_line_costs (
  id uuid primary key references public.quote_lines(id) on delete cascade,   -- the quote line's id
  prescribed_unit_paise bigint check (prescribed_unit_paise is null or prescribed_unit_paise >= 0),
  unit_cost_paise bigint check (unit_cost_paise is null or unit_cost_paise >= 0)
);
alter table public.quote_line_costs enable row level security;
create policy quote_line_costs_read on public.quote_line_costs for select using (app.has_role('owner', 'accounts'));
create policy quote_line_costs_write on public.quote_line_costs for all using (app.is_owner()) with check (app.is_owner());
select app.enable_audit('public.quote_line_costs');

-- A final entertainment or extras choice may complete what the quote needs.
create or replace function app.on_selection_final() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  if new.status = 'final' and old.status is distinct from 'final' then
    insert into public.agent_tasks (kind, wedding_id, payload)
    values ('selection_finalised', new.wedding_id, jsonb_build_object('selection_id', new.id, 'vertical', new.vertical));
  end if;
  return new;
end $$;
create trigger wedding_selections_on_final after update of status on public.wedding_selections
  for each row execute function app.on_selection_final();

-- ---------------------------------------------------------------------------
-- Work orders: what each vendor is booked to deliver, from the approved quote.
-- [{description, quantity, function_id, function_name, date, unit_cost_paise}]
-- When the vendor accepts, the checklist (one task per item) is created.
-- ---------------------------------------------------------------------------
alter table public.vendor_bookings
  add column work_order jsonb not null default '[]'::jsonb,
  add column checklist_created_at timestamptz;

-- Every answer reaches the Vendor Coordinator, whether the vendor used their
-- link or the event manager recorded a phone call.
create or replace function app.on_vendor_answer() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  if old.status = 'requested' and new.status in ('confirmed', 'declined') then
    insert into public.agent_tasks (kind, wedding_id, payload)
    values ('vendor_replied', new.wedding_id, jsonb_build_object('booking_id', new.id, 'status', new.status));
  end if;
  return new;
end $$;
create trigger vendor_bookings_on_answer after update of status on public.vendor_bookings
  for each row execute function app.on_vendor_answer();

-- ---------------------------------------------------------------------------
-- Guest link: one public page per wedding for the guests staying with us:
-- welcome, itinerary, the property, and add-on services they can request.
-- ---------------------------------------------------------------------------
alter table public.weddings
  add column guest_token text not null default encode(extensions.gen_random_bytes(12), 'hex'),
  add column guest_welcome text;
create unique index weddings_guest_token_idx on public.weddings(guest_token);

create table public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  option_id uuid references public.service_options(id) on delete set null,
  option_name text not null,
  guest_name text not null check (length(trim(guest_name)) between 2 and 120),
  phone_e164 text,
  room text,
  quantity integer not null default 1 check (quantity between 1 and 50),
  wanted_on date,
  notes text check (notes is null or length(notes) <= 1000),
  status text not null default 'new' check (status in ('new', 'confirmed', 'done', 'cancelled')),
  handled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guest_requests_wedding_idx on public.guest_requests(wedding_id, created_at desc);
create trigger guest_requests_touch before update on public.guest_requests
  for each row execute function app.touch_updated_at();
alter table public.guest_requests enable row level security;
-- Guests write through the server (service role) after the link is checked; staff read and handle.
create policy guest_requests_read on public.guest_requests for select using (app.staff_can_see_wedding(wedding_id));
create policy guest_requests_handle on public.guest_requests for update
  using (app.staff_can_see_wedding(wedding_id)) with check (app.staff_can_see_wedding(wedding_id));
select app.enable_audit('public.guest_requests');

-- ---------------------------------------------------------------------------
-- Portal access window: family logins work until the end of the wedding day
-- (policy 'portal.access'), unless staff keep a wedding's portal open longer.
-- ---------------------------------------------------------------------------
alter table public.weddings add column portal_access_until date;

create or replace function app.portal_open(p_wedding uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, app as $$
  select coalesce((
    select (now() at time zone 'Asia/Kolkata')::date <= coalesce(
             w.portal_access_until,
             w.event_end + coalesce((app.policy_value('portal.access') ->> 'close_days_after_event')::integer, 0))
      from public.weddings w where w.id = p_wedding), false)
$$;

create or replace function app.is_wedding_member(p_wedding uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, app as $$
  select exists (
    select 1 from public.wedding_members m
    where m.wedding_id = p_wedding and m.user_id = auth.uid()
  ) and app.portal_open(p_wedding)
$$;

create or replace function app.member_can(p_wedding uuid, p_permission text) returns boolean
language sql stable security definer set search_path = pg_catalog, public, app as $$
  select app.portal_open(p_wedding) and coalesce((
    select case p_permission
      when 'start_stages'   then m.can_start_stages
      when 'edit_brief'     then m.can_edit_brief
      when 'approve'        then m.can_approve
      when 'view_payments'  then m.can_view_payments
      when 'manage_members' then m.can_manage_members
      else false end
    from public.wedding_members m
    where m.wedding_id = p_wedding and m.user_id = auth.uid()
    limit 1
  ), false)
$$;

-- For the portal's "thank you" screen once access has closed.
create or replace function public.my_closed_portal() returns table (title text, event_end date)
language sql stable security definer set search_path = pg_catalog, public, app as $$
  select w.title, w.event_end
    from public.wedding_members m join public.weddings w on w.id = m.wedding_id
   where m.user_id = auth.uid() and not app.portal_open(w.id)
   order by w.event_end desc limit 1
$$;
revoke execute on function public.my_closed_portal() from public, anon;
grant execute on function public.my_closed_portal() to authenticated;

-- ---------------------------------------------------------------------------
-- The meeting's decisions as policy edits (fresh databases get them from the seed).
-- ---------------------------------------------------------------------------
do $m$
begin
  perform set_config('app.change_note', 'Workflow meeting 2026-10-12: portal logins close after the wedding day; the review form goes out on the evening of the last function.', true);

  insert into public.policies (key, topic, title, rule_text, value, client_visible, needs_confirmation, sort)
  values ('portal.access', 'Planning', 'Portal access',
          'Couples'' and families'' portal logins work until the end of the wedding day. After that, the review form, thank-you and photos come by email and WhatsApp.',
          '{"close_days_after_event":0}'::jsonb, true, false, 85)
  on conflict (key) do nothing;

  update public.policies
     set value = value || '{"send_days_after_event":0,"send_at":"19:00"}'::jsonb
   where key = 'reviews.after_event' and (value ->> 'send_days_after_event') is distinct from '0';

  update public.policies
     set rule_text = 'The review form goes out by email on the evening of the last function. Three days after the event the couple gets a thank-you note and their photo-sharing link; the parting gift follows the next day, the newsletter invitation after that, and a referral ask two weeks later. We send anniversary wishes every year.'
   where key = 'offboarding.sequence' and rule_text like 'Three days after the event the couple gets a thank-you note, their photo-sharing link and the review form%';
end $m$;
