-- =============================================================================
-- Wiwaha OS · 0004 · Weddings (the Wedding Room) + Event Management & CRM
-- =============================================================================

create type public.wedding_stage as enum (
  'booking', 'onboarding', 'planning', 'final_payment', 'execution', 'close_out', 'offboarding'
);
create type public.wedding_status as enum ('tentative', 'active', 'completed', 'cancelled');

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- e.g. 'WIW-2027-001'
  title text not null,                       -- 'Ananya & Rohan'
  lead_id uuid references public.leads(id),
  primary_contact_id uuid references public.contacts(id),
  event_start date not null,
  event_end date not null,
  guest_count integer,
  stage public.wedding_stage not null default 'booking',
  status public.wedding_status not null default 'tentative',
  event_manager_id uuid references public.profiles(id),
  sales_owner_id uuid references public.profiles(id),
  contract_value_paise bigint check (contract_value_paise is null or contract_value_paise >= 0),
  booked_on date,
  complimentary_rooms integer not null default 0,
  whatsapp_group_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (event_end >= event_start)
);
create index weddings_dates_idx on public.weddings(event_start);
create index weddings_manager_idx on public.weddings(event_manager_id);
create trigger weddings_touch before update on public.weddings
  for each row execute function app.touch_updated_at();

alter table public.leads add constraint leads_wedding_fk
  foreign key (wedding_id) references public.weddings(id) on delete set null;
alter table public.leads add constraint leads_referred_by_fk
  foreign key (referred_by_wedding_id) references public.weddings(id) on delete set null;
alter table public.calls add constraint calls_wedding_fk
  foreign key (wedding_id) references public.weddings(id) on delete set null;
alter table public.agent_actions add constraint agent_actions_lead_fk
  foreign key (lead_id) references public.leads(id) on delete set null;
alter table public.agent_actions add constraint agent_actions_wedding_fk
  foreign key (wedding_id) references public.weddings(id) on delete set null;
alter table public.approvals add constraint approvals_lead_fk
  foreign key (lead_id) references public.leads(id) on delete set null;
alter table public.approvals add constraint approvals_wedding_fk
  foreign key (wedding_id) references public.weddings(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Portal members: couple, parents, planner each get a login + permissions.
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('couple', 'parent', 'planner', 'family', 'coordinator');

create table public.wedding_members (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  contact_id uuid references public.contacts(id),
  email extensions.citext not null,
  display_name text not null,
  member_role public.member_role not null,
  -- the couple decides what parents / planner may do
  can_start_stages boolean not null default false,
  can_edit_brief boolean not null default false,
  can_approve boolean not null default false,
  can_view_payments boolean not null default false,
  can_manage_members boolean not null default false,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, email)
);
create index wedding_members_user_idx on public.wedding_members(user_id);
create trigger wedding_members_touch before update on public.wedding_members
  for each row execute function app.touch_updated_at();

-- Access helpers ------------------------------------------------------------
create or replace function app.is_wedding_member(p_wedding uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.wedding_members m
    where m.wedding_id = p_wedding and m.user_id = auth.uid()
  )
$$;

create or replace function app.member_can(p_wedding uuid, p_permission text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((
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

-- Staff who can see a wedding: owner/sales/accounts see all; event managers
-- see the weddings assigned to them; estate staff see weddings they have tasks on.
create or replace function app.staff_can_see_wedding(p_wedding uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.has_role('owner', 'sales', 'accounts')
      or (app.has_role('event_manager') and exists (
            select 1 from public.weddings w where w.id = p_wedding and w.event_manager_id = auth.uid()))
$$;

create or replace function app.staff_can_edit_wedding(p_wedding uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_owner()
      or (app.has_role('event_manager') and exists (
            select 1 from public.weddings w where w.id = p_wedding and w.event_manager_id = auth.uid()))
$$;

create or replace function app.can_see_wedding(p_wedding uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.staff_can_see_wedding(p_wedding) or app.is_wedding_member(p_wedding)
$$;

alter table public.weddings enable row level security;
create policy weddings_read on public.weddings for select using (app.can_see_wedding(id));
create policy weddings_insert on public.weddings for insert with check (app.has_role('owner', 'sales'));
create policy weddings_update on public.weddings for update
  using (app.staff_can_edit_wedding(id) or app.has_role('sales'))
  with check (app.staff_can_edit_wedding(id) or app.has_role('sales'));
select app.enable_audit('public.weddings');

alter table public.wedding_members enable row level security;
create policy wedding_members_read on public.wedding_members for select
  using (app.can_see_wedding(wedding_id));
create policy wedding_members_manage on public.wedding_members for all
  using (app.staff_can_edit_wedding(wedding_id) or app.member_can(wedding_id, 'manage_members'))
  with check (app.staff_can_edit_wedding(wedding_id) or app.member_can(wedding_id, 'manage_members'));
select app.enable_audit('public.wedding_members');

-- Family contacts attached to a wedding (CRM timeline per family)
create table public.wedding_contacts (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  relation text,                          -- 'bride', 'father of groom', ...
  is_key_contact boolean not null default false, -- in the WhatsApp group
  primary key (wedding_id, contact_id)
);
alter table public.wedding_contacts enable row level security;
create policy wedding_contacts_read on public.wedding_contacts for select
  using (app.staff_can_see_wedding(wedding_id));
create policy wedding_contacts_write on public.wedding_contacts for all
  using (app.staff_can_edit_wedding(wedding_id) or app.has_role('sales'))
  with check (app.staff_can_edit_wedding(wedding_id) or app.has_role('sales'));

-- ---------------------------------------------------------------------------
-- Stage cards in the client portal (PRD §7). Definitions come from the policy
-- book (policy 'portal.stage_cards'); rows are created per wedding.
-- ---------------------------------------------------------------------------
create type public.stage_status as enum ('locked', 'not_started', 'in_progress', 'awaiting_client', 'done', 'snoozed');

create table public.wedding_stages (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  key text not null,                        -- 'brief', 'ceremonies', 'menus', 'decor', 'guests_rooms', 'vendors', 'final_payment', 'memories'
  name text not null,
  sort integer not null,
  recommended_start date,
  unlock_rule text not null,                -- 'deposit_paid' | 'brief_started' | 'contract_paid' | 'quote_approved' | 'event_complete'
  status public.stage_status not null default 'locked',
  started_at timestamptz,
  started_by uuid references public.profiles(id),
  completed_at timestamptz,
  owner_label text,                         -- "who's working on it"
  needs_from_client text,                   -- "what's needed from the couple"
  nudged_at timestamptz,
  escalated_at timestamptz,
  snoozed_until date,
  snooze_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, key)
);
create trigger wedding_stages_touch before update on public.wedding_stages
  for each row execute function app.touch_updated_at();
alter table public.wedding_stages enable row level security;
create policy wedding_stages_read on public.wedding_stages for select using (app.can_see_wedding(wedding_id));
create policy wedding_stages_staff_write on public.wedding_stages for update
  using (app.staff_can_edit_wedding(wedding_id)) with check (app.staff_can_edit_wedding(wedding_id));
-- Clients start stages only through app.start_stage(), which enforces unlocks.
select app.enable_audit('public.wedding_stages');

-- ---------------------------------------------------------------------------
-- Functions (haldi, mehendi, sangeet, wedding, reception...)
-- ---------------------------------------------------------------------------
create type public.function_type as enum ('haldi', 'mehendi', 'sangeet', 'wedding', 'reception', 'engagement', 'cocktail', 'pooja', 'other');

create table public.event_functions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  type public.function_type not null,
  name text not null,
  date date not null,
  start_time time,
  end_time time,
  space_id uuid references public.spaces(id),
  guest_count integer,
  rituals text,                              -- rituals that affect setup
  notes text,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_functions_wedding_idx on public.event_functions(wedding_id, date);
create trigger event_functions_touch before update on public.event_functions
  for each row execute function app.touch_updated_at();
alter table public.event_functions enable row level security;
create policy event_functions_read on public.event_functions for select using (app.can_see_wedding(wedding_id));
create policy event_functions_write on public.event_functions for all
  using (app.staff_can_edit_wedding(wedding_id) or app.member_can(wedding_id, 'edit_brief'))
  with check (app.staff_can_edit_wedding(wedding_id) or app.member_can(wedding_id, 'edit_brief'));
select app.enable_audit('public.event_functions');

-- ---------------------------------------------------------------------------
-- Moodboards (~5 per function, broad → detail, standard vs custom)
-- ---------------------------------------------------------------------------
create type public.design_kind as enum ('standard', 'custom');
create type public.moodboard_status as enum ('generated', 'shortlisted', 'rejected', 'finalised', 'approved');

create table public.moodboards (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid not null references public.event_functions(id) on delete cascade,
  round smallint not null default 1 check (round >= 1),  -- 1 = broad theme, 2+ = detail
  theme text not null,
  design_kind public.design_kind not null,
  images jsonb not null default '[]'::jsonb,              -- [{url, caption, source}]
  palette text[] not null default '{}',
  description text,
  status public.moodboard_status not null default 'generated',
  client_feedback text,
  finalised_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),     -- Prashanth for custom work
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger moodboards_touch before update on public.moodboards
  for each row execute function app.touch_updated_at();
alter table public.moodboards enable row level security;
create policy moodboards_read on public.moodboards for select using (app.can_see_wedding(wedding_id));
create policy moodboards_staff_write on public.moodboards for all
  using (app.staff_can_edit_wedding(wedding_id)) with check (app.staff_can_edit_wedding(wedding_id));
select app.enable_audit('public.moodboards');

-- ---------------------------------------------------------------------------
-- Menus
-- ---------------------------------------------------------------------------
create table public.menus (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid not null references public.event_functions(id) on delete cascade,
  cuisine text not null,                       -- 'South Indian', 'Continental', 'Rajasthani', ...
  outside_caterer boolean not null default false,
  outside_caterer_name text,
  per_plate_paise bigint,
  plate_count integer,
  tasting_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'proposed', 'client_approved', 'chef_confirmed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger menus_touch before update on public.menus
  for each row execute function app.touch_updated_at();

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  course text not null,                        -- 'welcome drink', 'starter', 'main', 'dessert'
  name text not null,
  is_veg boolean not null default true,
  notes text,
  sort integer not null default 100
);

alter table public.menus enable row level security;
alter table public.menu_items enable row level security;
create policy menus_read on public.menus for select using (app.can_see_wedding(wedding_id));
create policy menus_write on public.menus for all
  using (app.staff_can_edit_wedding(wedding_id)) with check (app.staff_can_edit_wedding(wedding_id));
create policy menu_items_read on public.menu_items for select
  using (exists (select 1 from public.menus m where m.id = menu_id and app.can_see_wedding(m.wedding_id)));
create policy menu_items_write on public.menu_items for all
  using (exists (select 1 from public.menus m where m.id = menu_id and app.staff_can_edit_wedding(m.wedding_id)))
  with check (exists (select 1 from public.menus m where m.id = menu_id and app.staff_can_edit_wedding(m.wedding_id)));
select app.enable_audit('public.menus');

-- ---------------------------------------------------------------------------
-- Price book (Quote agent prices only from here; off-book → Prashanth)
-- ---------------------------------------------------------------------------
create table public.price_book_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null,                    -- 'venue', 'rooms', 'catering', 'decor', 'av', 'services'
  name text not null,
  unit text not null,                        -- 'per_plate', 'per_day', 'per_night', 'each', 'lump_sum'
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  gst_rate_bps integer not null default 1800 check (gst_rate_bps between 0 and 2800),
  design_kind public.design_kind,            -- for décor items: standard catalogue vs custom
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger price_book_touch before update on public.price_book_items
  for each row execute function app.touch_updated_at();
alter table public.price_book_items enable row level security;
create policy price_book_read on public.price_book_items for select
  using (app.has_role('owner', 'sales', 'event_manager', 'accounts'));
create policy price_book_write on public.price_book_items for all
  using (app.is_owner()) with check (app.is_owner());
select app.enable_audit('public.price_book_items');

-- ---------------------------------------------------------------------------
-- Quotes and contracts
-- ---------------------------------------------------------------------------
create type public.quote_status as enum ('draft', 'pending_approval', 'sent', 'client_approved', 'superseded', 'rejected');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  version integer not null default 1,
  status public.quote_status not null default 'draft',
  subtotal_paise bigint not null default 0,
  discount_paise bigint not null default 0,
  tax_paise bigint not null default 0,
  total_paise bigint not null default 0,
  valid_until date,
  notes text,
  client_approved_at timestamptz,
  client_approved_by uuid references public.profiles(id),
  created_by_agent text references public.agents(key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, version)
);
create trigger quotes_touch before update on public.quotes
  for each row execute function app.touch_updated_at();

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  price_book_item_id uuid references public.price_book_items(id),
  function_id uuid references public.event_functions(id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price_paise bigint not null,
  gst_rate_bps integer not null default 1800,
  line_total_paise bigint not null,
  off_book boolean not null default false,   -- not in the price book → needs Prashanth
  sort integer not null default 100
);

create type public.contract_status as enum ('draft', 'pending_approval', 'sent', 'signed', 'void');

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  quote_id uuid references public.quotes(id),
  version integer not null default 1,
  template_key text not null default 'standard_bw',
  body_md text not null default '',
  status public.contract_status not null default 'draft',
  sent_at timestamptz,
  signed_at timestamptz,
  countersigned_by uuid references public.profiles(id),
  esign_provider text,
  esign_ref text,
  document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, version)
);
create trigger contracts_touch before update on public.contracts
  for each row execute function app.touch_updated_at();

alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.contracts enable row level security;
create policy quotes_read on public.quotes for select
  using (app.staff_can_see_wedding(wedding_id)
         or (app.is_wedding_member(wedding_id) and status in ('sent', 'client_approved', 'superseded')));
create policy quotes_write on public.quotes for all
  using (app.staff_can_edit_wedding(wedding_id) or app.has_role('sales'))
  with check (app.staff_can_edit_wedding(wedding_id) or app.has_role('sales'));
create policy quote_lines_read on public.quote_lines for select
  using (exists (select 1 from public.quotes q where q.id = quote_id
                 and (app.staff_can_see_wedding(q.wedding_id)
                      or (app.is_wedding_member(q.wedding_id) and q.status in ('sent', 'client_approved', 'superseded')))));
create policy quote_lines_write on public.quote_lines for all
  using (exists (select 1 from public.quotes q where q.id = quote_id and (app.staff_can_edit_wedding(q.wedding_id) or app.has_role('sales'))))
  with check (exists (select 1 from public.quotes q where q.id = quote_id and (app.staff_can_edit_wedding(q.wedding_id) or app.has_role('sales'))));
create policy contracts_read on public.contracts for select
  using (app.staff_can_see_wedding(wedding_id)
         or (app.is_wedding_member(wedding_id) and status in ('sent', 'signed')));
create policy contracts_write on public.contracts for all
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));
select app.enable_audit('public.quotes');
select app.enable_audit('public.contracts');

-- ---------------------------------------------------------------------------
-- Payments (10 / 40 / 50 by default; schedule comes from policy 'payments.schedule')
-- ---------------------------------------------------------------------------
create type public.payment_status as enum ('scheduled', 'link_sent', 'paid', 'overdue', 'waived', 'refunded', 'cancelled');
create type public.payment_method as enum ('upi', 'card', 'netbanking', 'bank_transfer', 'cash', 'cheque', 'other');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  milestone text not null,                  -- 'deposit', 'contract', 'final', 'other'
  label text not null,                      -- '10% deposit — holds the date'
  percent_bps integer check (percent_bps between 0 and 10000),
  amount_paise bigint not null check (amount_paise >= 0),
  due_on date not null,
  status public.payment_status not null default 'scheduled',
  paid_at timestamptz,
  paid_amount_paise bigint,
  method public.payment_method,
  gateway text,
  gateway_ref text,
  link_url text,
  receipt_path text,
  reminders_sent jsonb not null default '[]'::jsonb,  -- [{at, offset_days, channel}]
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, milestone)
);
create index payments_due_idx on public.payments(due_on) where status in ('scheduled', 'link_sent', 'overdue');
create trigger payments_touch before update on public.payments
  for each row execute function app.touch_updated_at();
alter table public.payments enable row level security;
create policy payments_read on public.payments for select
  using (app.has_role('owner', 'accounts', 'sales')
         or (app.has_role('event_manager') and app.staff_can_see_wedding(wedding_id))
         or app.member_can(wedding_id, 'view_payments'));
create policy payments_write on public.payments for all
  using (app.has_role('owner', 'accounts')) with check (app.has_role('owner', 'accounts'));
select app.enable_audit('public.payments');

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,                   -- 'photography', 'decor', 'catering', 'music', 'makeup', ...
  contact_name text,
  phone_e164 text,
  email extensions.citext,
  rates jsonb not null default '{}'::jsonb,
  rating numeric(3, 2) check (rating is null or rating between 0 and 5),
  commission_bps integer not null default 0,
  preferred boolean not null default false,
  designated_planner boolean not null default false, -- may deliver décor (policy 'decor.providers')
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vendors_touch before update on public.vendors
  for each row execute function app.touch_updated_at();

create table public.vendor_users (
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (vendor_id, user_id)
);

create or replace function app.is_vendor_user(p_vendor uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.vendor_users vu where vu.vendor_id = p_vendor and vu.user_id = auth.uid())
$$;

create type public.vendor_booking_status as enum ('requested', 'confirmed', 'declined', 'cancelled', 'completed');

create table public.vendor_bookings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid references public.event_functions(id) on delete set null,
  status public.vendor_booking_status not null default 'requested',
  brief text,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  amount_paise bigint,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending_approval', 'approved', 'paid')),
  deliverables jsonb not null default '[]'::jsonb,
  score_on_time smallint check (score_on_time between 1 and 5),
  score_quality smallint check (score_quality between 1 and 5),
  score_client smallint check (score_client between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vendor_bookings_touch before update on public.vendor_bookings
  for each row execute function app.touch_updated_at();

alter table public.vendors enable row level security;
alter table public.vendor_users enable row level security;
alter table public.vendor_bookings enable row level security;
create policy vendors_read on public.vendors for select
  using (app.has_role('owner', 'sales', 'event_manager', 'accounts') or app.is_vendor_user(id));
create policy vendors_write on public.vendors for all
  using (app.has_role('owner', 'event_manager')) with check (app.has_role('owner', 'event_manager'));
create policy vendor_users_read on public.vendor_users for select
  using (app.is_owner() or user_id = auth.uid());
create policy vendor_users_write on public.vendor_users for all
  using (app.is_owner()) with check (app.is_owner());
create policy vendor_bookings_read on public.vendor_bookings for select
  using (app.staff_can_see_wedding(wedding_id) or app.is_vendor_user(vendor_id));
create policy vendor_bookings_write on public.vendor_bookings for all
  using (app.staff_can_edit_wedding(wedding_id)) with check (app.staff_can_edit_wedding(wedding_id));
-- Vendors confirm dates / upload deliverables via RPC (Phase 3) so they can't edit other fields.
select app.enable_audit('public.vendors');
select app.enable_audit('public.vendor_bookings');

-- ---------------------------------------------------------------------------
-- Reviews (Reputation agent) — low scores reach Prashanth within 2 hours
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  contact_id uuid references public.contacts(id),
  form_sent_at timestamptz,
  submitted_at timestamptz,
  score smallint check (score between 1 and 5),
  nps smallint check (nps between 0 and 10),
  answers jsonb not null default '{}'::jsonb,
  testimonial text,
  publish_consent boolean not null default false,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
create policy reviews_read on public.reviews for select
  using (app.has_role('owner', 'sales') or app.staff_can_see_wedding(wedding_id));
