-- =============================================================================
-- Wiwaha OS · 0013 · Phase 2 (sales engine)
-- Outbox for every outbound message/call, inbound webhook log, executive
-- availability, visit booking fields, the single follow-up call (enforced
-- here), voice call state, external reviews and website chat.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Outbox: every message, call, payment link and signature request that leaves
-- the building goes through here. In sandbox mode (no provider keys) rows are
-- marked 'sandboxed' instead of being sent, so the whole flow can be demoed.
-- ---------------------------------------------------------------------------
create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('whatsapp', 'email', 'sms', 'instagram', 'call', 'payment_link', 'esign', 'web_chat')),
  provider text not null,                          -- 'sandbox', 'gupshup', 'resend', 'exotel', 'razorpay', 'digio', ...
  to_address text,
  subject text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'sandboxed', 'failed', 'delivered', 'read')),
  provider_ref text,
  error text,
  attempts integer not null default 0,
  message_id uuid references public.messages(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  wedding_id uuid references public.weddings(id) on delete set null,
  subject_table text,
  subject_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index outbox_created_idx on public.outbox(created_at desc);
create index outbox_lead_idx on public.outbox(lead_id) where lead_id is not null;
create index outbox_wedding_idx on public.outbox(wedding_id) where wedding_id is not null;
alter table public.outbox enable row level security;
create policy outbox_read on public.outbox for select
  using (app.has_role('owner', 'sales', 'event_manager', 'accounts'));
-- writes: service role only (integrations run server-side)

-- ---------------------------------------------------------------------------
-- Inbound webhooks (WhatsApp, Instagram, lead forms, WedMeGood email, calls,
-- payments, e-sign). Unique (source, external_id) makes every webhook
-- idempotent: a retried delivery is recorded once.
-- ---------------------------------------------------------------------------
create table public.inbound_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  lead_id uuid references public.leads(id) on delete set null,
  wedding_id uuid references public.weddings(id) on delete set null,
  error text,
  unique (source, external_id)
);
create index inbound_events_received_idx on public.inbound_events(received_at desc);
alter table public.inbound_events enable row level security;
create policy inbound_events_read on public.inbound_events for select using (app.is_owner());

-- ---------------------------------------------------------------------------
-- Sales calendar: when each executive can host a site visit.
-- ---------------------------------------------------------------------------
create table public.exec_availability (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  unique (profile_id, weekday, start_time)
);
create table public.exec_time_off (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);
alter table public.exec_availability enable row level security;
alter table public.exec_time_off enable row level security;
create policy exec_availability_read on public.exec_availability for select using (app.is_staff());
create policy exec_availability_write on public.exec_availability for all
  using (app.is_owner() or profile_id = auth.uid()) with check (app.is_owner() or profile_id = auth.uid());
create policy exec_time_off_read on public.exec_time_off for select using (app.is_staff());
create policy exec_time_off_write on public.exec_time_off for all
  using (app.is_owner() or profile_id = auth.uid()) with check (app.is_owner() or profile_id = auth.uid());
select app.enable_audit('public.exec_availability');

-- ---------------------------------------------------------------------------
-- Visits: booking, confirmation, reminder, brief, recap. An executive can't
-- be double-booked (exclusion constraint on their time slot).
-- ---------------------------------------------------------------------------
alter table public.visits
  add column duration_minutes integer not null default 90 check (duration_minutes > 0),
  add column slot_end timestamptz,
  add column booked_by_agent text references public.agents(key),
  add column confirmation_sent_at timestamptz,
  add column reminder_sent_at timestamptz,
  add column brief_sent_at timestamptz,
  add column voice_note_transcript text,
  add column recap text,
  add column recap_at timestamptz;

create or replace function app.set_visit_slot_end() returns trigger
language plpgsql set search_path = pg_catalog, public, app as $$
begin
  new.slot_end := new.scheduled_at + make_interval(mins => new.duration_minutes);
  return new;
end $$;
create trigger visits_slot_end before insert or update of scheduled_at, duration_minutes on public.visits
  for each row execute function app.set_visit_slot_end();
update public.visits set slot_end = scheduled_at + make_interval(mins => duration_minutes);
alter table public.visits alter column slot_end set not null;
alter table public.visits add constraint visits_no_double_booking exclude using gist (
  executive_id with =,
  tstzrange(scheduled_at, slot_end) with &&
) where (status in ('scheduled', 'rescheduled') and executive_id is not null);

-- ---------------------------------------------------------------------------
-- Calls: voice session state, the visit a follow-up belongs to, and the rule
-- "exactly one follow-up call per visit" enforced by a unique index.
-- ---------------------------------------------------------------------------
alter table public.calls
  add column visit_id uuid references public.visits(id) on delete set null,
  add column state jsonb not null default '{}'::jsonb,   -- {turns: [...], intents: [...], transfer: {...}}
  add column status text not null default 'completed' check (status in ('ringing', 'in_progress', 'completed', 'no_answer', 'failed', 'transferred')),
  add column ended_at timestamptz,
  add column recording_url text;
create unique index calls_one_follow_up_per_visit on public.calls(visit_id) where purpose = 'follow_up';
create index calls_provider_ref_idx on public.calls(provider_ref) where provider_ref is not null;
select app.enable_audit('public.calls');

-- ---------------------------------------------------------------------------
-- Reviews on Google / WedMeGood, with reply drafts for approval.
-- ---------------------------------------------------------------------------
create table public.external_reviews (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('google', 'wedmegood')),
  external_id text not null,
  author_name text,
  rating smallint check (rating between 1 and 5),
  body text,
  posted_at timestamptz,
  wedding_id uuid references public.weddings(id) on delete set null,
  reply_draft text,
  reply_status text not null default 'none' check (reply_status in ('none', 'drafted', 'approved', 'posted', 'rejected')),
  approval_id uuid references public.approvals(id) on delete set null,
  testimonial_requested_at timestamptz,
  testimonial_consent boolean,
  created_at timestamptz not null default now(),
  unique (platform, external_id)
);
alter table public.external_reviews enable row level security;
create policy external_reviews_read on public.external_reviews for select using (app.has_role('owner', 'sales'));
create policy external_reviews_write on public.external_reviews for update
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));
select app.enable_audit('public.external_reviews');

-- ---------------------------------------------------------------------------
-- Website chat sessions. The visitor holds an unguessable token; messages
-- live in public.messages like every other channel.
-- ---------------------------------------------------------------------------
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  lead_id uuid references public.leads(id) on delete set null,
  visitor_name text,
  visitor_phone text,
  visitor_email text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
alter table public.chat_sessions enable row level security;
create policy chat_sessions_read on public.chat_sessions for select using (app.has_role('owner', 'sales'));
-- visitors talk to it only through the server (service role)

-- ---------------------------------------------------------------------------
-- Sales funnel by source (enquiry → visit → booking) and response times.
-- security_invoker so RLS on leads still applies to whoever queries it.
-- ---------------------------------------------------------------------------
create or replace view public.sales_funnel with (security_invoker = true) as
select
  l.source,
  count(*) as enquiries,
  count(*) filter (where exists (select 1 from public.visits v where v.lead_id = l.id)) as visits,
  count(*) filter (where l.status = 'won') as bookings,
  percentile_cont(0.5) within group (order by extract(epoch from (
    (select min(m.created_at) from public.messages m where m.lead_id = l.id and m.direction = 'outbound') - l.first_touch_at
  )) / 60.0) as median_first_reply_minutes
from public.leads l
group by l.source;
grant select on public.sales_funnel to authenticated;

-- ---------------------------------------------------------------------------
-- Our own review form (sent after each event): a private link per couple.
-- ---------------------------------------------------------------------------
alter table public.reviews
  add column form_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  add column testimonial_captured_at timestamptz;
create unique index reviews_form_token_idx on public.reviews(form_token);
