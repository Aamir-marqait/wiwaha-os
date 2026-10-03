-- =============================================================================
-- Wiwaha OS · 0003 · Estate (spaces, rooms) + Sales (contacts, leads, visits, calls)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Spaces and rooms
-- ---------------------------------------------------------------------------
create type public.space_kind as enum ('indoor', 'outdoor', 'semi_open');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind public.space_kind not null,
  capacity_seated integer not null check (capacity_seated >= 0),
  capacity_floating integer check (capacity_floating >= 0),
  description text,
  color text,                       -- calendar lane colour hint
  sort integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger spaces_touch before update on public.spaces
  for each row execute function app.touch_updated_at();

create type public.room_status as enum ('available', 'maintenance', 'out_of_service');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  room_type text not null,          -- 'deluxe', 'premium', 'suite'
  capacity integer not null default 2 check (capacity > 0),
  block text,
  floor integer,
  status public.room_status not null default 'available',
  sort integer not null default 100,
  active boolean not null default true,  -- false = planned (expansion to 60)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger rooms_touch before update on public.rooms
  for each row execute function app.touch_updated_at();

alter table public.spaces enable row level security;
alter table public.rooms enable row level security;
-- Spaces and rooms are not secret: any signed-in user (staff, client, vendor) can read.
create policy spaces_read on public.spaces for select using (auth.uid() is not null or app.is_service());
create policy spaces_owner_write on public.spaces for all using (app.is_owner()) with check (app.is_owner());
create policy rooms_read on public.rooms for select using (auth.uid() is not null or app.is_service());
create policy rooms_write on public.rooms for all
  using (app.has_role('owner', 'staff')) with check (app.has_role('owner', 'staff'));
select app.enable_audit('public.spaces');
select app.enable_audit('public.rooms');

-- ---------------------------------------------------------------------------
-- Contacts: people across leads and weddings. De-duplicated by E.164 phone.
-- ---------------------------------------------------------------------------
create type public.contact_role as enum ('bride', 'groom', 'parent', 'sibling', 'relative', 'planner', 'friend', 'corporate', 'other');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_e164 text unique check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email extensions.citext,
  role public.contact_role not null default 'other',
  city text,
  pincode text,
  preferred_language public.language_code not null default 'en',
  consent_whatsapp boolean not null default false,
  consent_email boolean not null default false,
  consent_calls boolean not null default true,
  newsletter_opt_in boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_email_idx on public.contacts(email) where email is not null;
create trigger contacts_touch before update on public.contacts
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create type public.lead_source as enum (
  'website', 'manual', 'phone', 'whatsapp', 'instagram', 'facebook', 'meta_form',
  'google_form', 'google_ads', 'wedmegood', 'referral', 'walk_in', 'other'
);
create type public.lead_status as enum (
  'new', 'contacted', 'visit_booked', 'visited', 'follow_up_done', 'negotiating',
  'won', 'lost', 'no_response'
);
create type public.event_type as enum ('wedding', 'reception', 'engagement', 'pre_wedding', 'corporate', 'family_function', 'other');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id),
  source public.lead_source not null,
  source_detail text,                   -- campaign, form name, referrer
  event_type public.event_type not null default 'wedding',
  date_wanted date,
  date_flexible boolean not null default false,
  alt_dates date[] not null default '{}',
  guest_count integer check (guest_count is null or guest_count >= 0),
  budget_paise bigint check (budget_paise is null or budget_paise >= 0),
  budget_text text,                     -- raw budget phrase from the enquiry
  rooms_needed integer,
  city text,                            -- where the family is based (out-of-town logic)
  message text,                         -- latest free-text message
  score integer check (score between 0 and 100),
  score_breakdown jsonb,
  hot boolean not null default false,
  status public.lead_status not null default 'new',
  assigned_to uuid references public.profiles(id),
  hold_expires_at timestamptz,          -- mirror of the active soft hold
  lost_reason text,
  referred_by_wedding_id uuid,          -- FK added once weddings exists
  wedding_id uuid,                      -- set when won
  touch_count integer not null default 1,
  first_touch_at timestamptz not null default now(),
  last_touch_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_status_idx on public.leads(status, last_touch_at desc);
create index leads_contact_idx on public.leads(contact_id);
create index leads_date_idx on public.leads(date_wanted);
create trigger leads_touch before update on public.leads
  for each row execute function app.touch_updated_at();

-- Every inbound/outbound touch on a lead, from any channel (dedupe keeps one lead).
create table public.lead_touches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel public.lead_source not null,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  message text,
  payload jsonb not null default '{}'::jsonb,   -- raw form / webhook body
  external_ref text,
  received_at timestamptz not null default now()
);
create index lead_touches_lead_idx on public.lead_touches(lead_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Site visits and follow-up (exactly one follow-up call, 2 days after)
-- ---------------------------------------------------------------------------
create type public.visit_status as enum ('scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled');
create type public.follow_up_outcome as enum ('pending', 'reached_interested', 'reached_not_interested', 'reached_undecided', 'no_response', 'not_required');

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  visit_number integer not null default 1,     -- repeat family visits on the same lead
  scheduled_at timestamptz not null,
  executive_id uuid references public.profiles(id),
  attendees text,
  attendee_count integer,
  status public.visit_status not null default 'scheduled',
  checklist jsonb not null default '{}'::jsonb, -- {uniform: true, refreshments: true, ...}
  pre_visit_brief text,
  notes text,
  voice_note_path text,
  follow_up_due_at timestamptz,
  follow_up_outcome public.follow_up_outcome not null default 'pending',
  follow_up_done_at timestamptz,
  follow_up_call_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index visits_scheduled_idx on public.visits(scheduled_at);
create index visits_lead_idx on public.visits(lead_id);
create trigger visits_touch before update on public.visits
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Calls (voice agent or human), attached to a lead or wedding
-- ---------------------------------------------------------------------------
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  wedding_id uuid,                              -- FK added later
  direction text not null check (direction in ('inbound', 'outbound')),
  purpose text,                                 -- 'enquiry', 'follow_up', 'reminder', ...
  handled_by text not null check (handled_by in ('agent', 'human')),
  agent_key text references public.agents(key),
  user_id uuid references public.profiles(id),
  from_number text,
  to_number text,
  language public.language_code,
  started_at timestamptz not null default now(),
  duration_seconds integer,
  recording_path text,
  transcript text,
  summary text,
  outcome text,
  handed_over boolean not null default false,
  provider_ref text,
  created_at timestamptz not null default now()
);
create index calls_lead_idx on public.calls(lead_id, started_at desc);
alter table public.visits add constraint visits_follow_up_call_fk
  foreign key (follow_up_call_id) references public.calls(id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS: sales data is for owner, sales and event managers (read).
-- ---------------------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.lead_touches enable row level security;
alter table public.visits enable row level security;
alter table public.calls enable row level security;

create policy contacts_read on public.contacts for select
  using (app.has_role('owner', 'sales', 'event_manager', 'accounts'));
create policy contacts_write on public.contacts for insert
  with check (app.has_role('owner', 'sales', 'event_manager'));
create policy contacts_update on public.contacts for update
  using (app.has_role('owner', 'sales', 'event_manager'))
  with check (app.has_role('owner', 'sales', 'event_manager'));

create policy leads_read on public.leads for select
  using (app.has_role('owner', 'sales', 'event_manager'));
create policy leads_insert on public.leads for insert
  with check (app.has_role('owner', 'sales'));
create policy leads_update on public.leads for update
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));

create policy lead_touches_read on public.lead_touches for select
  using (app.has_role('owner', 'sales', 'event_manager'));
create policy lead_touches_insert on public.lead_touches for insert
  with check (app.has_role('owner', 'sales'));

create policy visits_read on public.visits for select
  using (app.has_role('owner', 'sales', 'event_manager'));
create policy visits_write on public.visits for all
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));

create policy calls_read on public.calls for select
  using (app.has_role('owner', 'sales', 'event_manager'));
create policy calls_insert on public.calls for insert
  with check (app.has_role('owner', 'sales'));

select app.enable_audit('public.contacts');
select app.enable_audit('public.leads');
select app.enable_audit('public.visits');
