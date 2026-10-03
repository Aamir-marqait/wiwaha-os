-- =============================================================================
-- Wiwaha OS · 0015 · Phase 4 (operations and growth)
-- Run-of-show, task proof storage, rooms without double-booking, purchase
-- requests, invoices (final + GST), handover inspections, the offboarding
-- sequence, content posts, ad spend, and owner dashboard numbers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tasks: escalation tracking and offline-safe completion. client_ref lets a
-- phone that was offline replay its queue without creating duplicates.
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column escalated_to text check (escalated_to in ('event_manager', 'owner')),
  add column escalated_owner_at timestamptz,
  add column completed_offline_at timestamptz,
  add column client_ref text;
create unique index tasks_client_ref_idx on public.tasks(client_ref) where client_ref is not null;
create unique index tasks_one_per_template on public.tasks(wedding_id, template_id) where template_id is not null;

-- Staff complete their own tasks with proof through this RPC (works for the
-- offline queue too: p_completed_at is when they ticked it on the phone).
create or replace function app.complete_task(p_task_id uuid, p_proof_path text default null, p_note text default null, p_completed_at timestamptz default null)
returns public.tasks
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.tasks;
begin
  select * into v from public.tasks where id = p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if not (app.is_owner() or v.owner_id = auth.uid()
          or (v.wedding_id is not null and app.staff_can_edit_wedding(v.wedding_id))
          or (v.owner_id is null and v.owner_role = app.my_role())) then
    raise exception 'This task belongs to someone else' using errcode = '42501';
  end if;
  if v.status = 'done' then return v; end if; -- idempotent for offline replays
  if v.proof_kind in ('photo', 'file') and coalesce(p_proof_path, v.proof_path) is null then
    raise exception 'This task needs a % as proof', v.proof_kind;
  end if;
  update public.tasks
     set status = 'done',
         completed_at = least(coalesce(p_completed_at, now()), now()),
         completed_offline_at = case when p_completed_at is not null and p_completed_at < now() - interval '1 minute' then p_completed_at end,
         completed_by = auth.uid(),
         proof_path = coalesce(p_proof_path, proof_path),
         proof_note = coalesce(nullif(p_note, ''), proof_note)
   where id = p_task_id returning * into v;
  return v;
end $$;
create or replace function public.complete_task(p_task_id uuid, p_proof_path text default null, p_note text default null, p_completed_at timestamptz default null)
returns public.tasks language sql set search_path = pg_catalog, public, app as $$
  select * from app.complete_task(p_task_id, p_proof_path, p_note, p_completed_at)
$$;
revoke execute on function public.complete_task(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.complete_task(uuid, text, text, timestamptz) to authenticated, service_role;

-- Proof photos and files: private bucket, path = <task_id>/<file>.
-- Skipped where Supabase Storage isn't installed (the local test database).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('task-proof', 'task-proof', false) on conflict (id) do nothing;
    execute $p$create policy task_proof_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'task-proof' and app.is_staff())$p$;
    execute $p$create policy task_proof_read on storage.objects for select to authenticated
      using (bucket_id = 'task-proof' and app.is_staff())$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Run-of-show per function, shared with staff and vendors.
-- ---------------------------------------------------------------------------
create table public.run_of_show_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid not null references public.event_functions(id) on delete cascade,
  starts_at time not null,
  ends_at time,
  title text not null,
  owner_label text,
  vendor_id uuid references public.vendors(id) on delete set null,
  notes text,
  sort integer not null default 100,
  created_by_agent text references public.agents(key),
  created_at timestamptz not null default now()
);
create index run_of_show_function_idx on public.run_of_show_items(function_id, starts_at);
alter table public.run_of_show_items enable row level security;
create policy run_of_show_read on public.run_of_show_items for select
  using (app.can_see_wedding(wedding_id) or app.has_role('staff')
         or exists (select 1 from public.vendor_bookings vb where vb.wedding_id = run_of_show_items.wedding_id and app.is_vendor_user(vb.vendor_id)));
create policy run_of_show_write on public.run_of_show_items for all
  using (app.staff_can_edit_wedding(wedding_id)) with check (app.staff_can_edit_wedding(wedding_id));
select app.enable_audit('public.run_of_show_items');

-- ---------------------------------------------------------------------------
-- Rooms: a room can't hold two parties on overlapping nights.
-- ---------------------------------------------------------------------------
alter table public.room_allocations add constraint room_allocations_no_double_booking exclude using gist (
  room_id with =,
  daterange(check_in, check_out, '[)') with &&
) where (room_id is not null and status <> 'cancelled');

-- ---------------------------------------------------------------------------
-- Purchase requests (Estate): above the policy limit → Prashanth.
-- ---------------------------------------------------------------------------
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  quantity numeric(12, 2),
  amount_paise bigint not null check (amount_paise >= 0),
  reason text,
  status text not null default 'requested' check (status in ('requested', 'pending_approval', 'approved', 'rejected', 'ordered', 'received')),
  approval_id uuid references public.approvals(id) on delete set null,
  wedding_id uuid references public.weddings(id) on delete set null,
  requested_by uuid references public.profiles(id),
  requested_by_agent text references public.agents(key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger purchase_requests_touch before update on public.purchase_requests
  for each row execute function app.touch_updated_at();
alter table public.purchase_requests enable row level security;
create policy purchase_requests_read on public.purchase_requests for select using (app.has_role('owner', 'staff', 'accounts'));
create policy purchase_requests_write on public.purchase_requests for all
  using (app.has_role('owner', 'staff')) with check (app.has_role('owner', 'staff'));
select app.enable_audit('public.purchase_requests');

-- ---------------------------------------------------------------------------
-- Invoices: final invoice and GST invoices after the event.
-- ---------------------------------------------------------------------------
create sequence public.invoice_seq;
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  kind text not null check (kind in ('final', 'gst', 'credit_note')),
  number text not null unique,
  issued_on date not null default current_date,
  lines jsonb not null default '[]'::jsonb,       -- [{description, category, quantity, unit_price_paise, gst_rate_bps, taxable_paise, tax_paise}]
  subtotal_paise bigint not null default 0,
  cgst_paise bigint not null default 0,
  sgst_paise bigint not null default 0,
  igst_paise bigint not null default 0,
  total_paise bigint not null default 0,
  amount_paid_paise bigint not null default 0,
  balance_paise bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'issued', 'paid', 'void')),
  approval_id uuid references public.approvals(id) on delete set null,
  exported_at timestamptz,
  created_at timestamptz not null default now()
);
create index invoices_wedding_idx on public.invoices(wedding_id);
alter table public.invoices enable row level security;
create policy invoices_read on public.invoices for select
  using (app.has_role('owner', 'accounts') or (app.member_can(wedding_id, 'view_payments') and status in ('issued', 'paid')));
create policy invoices_write on public.invoices for update
  using (app.has_role('owner', 'accounts')) with check (app.has_role('owner', 'accounts'));
select app.enable_audit('public.invoices');

create or replace function app.next_invoice_number(p_prefix text) returns text
language sql volatile security definer set search_path = pg_catalog, public, app as $$
  select p_prefix || '/' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '/' || lpad(nextval('public.invoice_seq')::text, 4, '0')
$$;

-- ---------------------------------------------------------------------------
-- Close-out: handover inspection with photos, damage, deposit decision.
-- ---------------------------------------------------------------------------
create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  inspected_at timestamptz not null default now(),
  inspector_id uuid references public.profiles(id),
  items jsonb not null default '[]'::jsonb,       -- [{area, ok, note, photo_path, damage_paise}]
  damage_total_paise bigint not null default 0,
  deposit_decision text check (deposit_decision in ('refund_full', 'refund_partial', 'retain')),
  deposit_refund_paise bigint,
  approval_id uuid references public.approvals(id) on delete set null,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (wedding_id)
);
alter table public.inspections enable row level security;
create policy inspections_read on public.inspections for select using (app.has_role('owner', 'staff', 'event_manager', 'accounts'));
create policy inspections_write on public.inspections for all
  using (app.has_role('owner', 'staff', 'event_manager')) with check (app.has_role('owner', 'staff', 'event_manager'));
select app.enable_audit('public.inspections');

-- ---------------------------------------------------------------------------
-- Offboarding sequence: one row per step per wedding, so steps go out once,
-- in order, on the right day.
-- ---------------------------------------------------------------------------
create table public.offboarding_steps (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  key text not null,
  due_on date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'drafted', 'sent', 'skipped')),
  message_id uuid references public.messages(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (wedding_id, key)
);
alter table public.offboarding_steps enable row level security;
create policy offboarding_steps_read on public.offboarding_steps for select
  using (app.has_role('owner', 'event_manager', 'sales'));

-- ---------------------------------------------------------------------------
-- Marketing: draft posts and ad spend.
-- ---------------------------------------------------------------------------
create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  scheduled_for date not null,
  platform text not null check (platform in ('instagram', 'facebook', 'youtube', 'linkedin', 'x')),
  theme text not null,
  caption text not null,
  hashtags text[] not null default '{}',
  media_brief text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'scheduled', 'posted', 'rejected')),
  approval_id uuid references public.approvals(id) on delete set null,
  created_by_agent text references public.agents(key),
  created_at timestamptz not null default now(),
  unique (scheduled_for, platform)
);
alter table public.content_posts enable row level security;
create policy content_posts_read on public.content_posts for select using (app.has_role('owner', 'sales'));
create policy content_posts_write on public.content_posts for update
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));

create table public.ad_spend (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('meta', 'google')),
  day date not null,
  campaign text not null default 'all',
  lead_source public.lead_source not null,
  spend_paise bigint not null check (spend_paise >= 0),
  clicks integer,
  impressions integer,
  imported_from text,
  created_at timestamptz not null default now(),
  unique (platform, day, campaign)
);
alter table public.ad_spend enable row level security;
create policy ad_spend_rw on public.ad_spend for all
  using (app.has_role('owner', 'sales', 'accounts')) with check (app.has_role('owner', 'sales', 'accounts'));

-- ---------------------------------------------------------------------------
-- Owner dashboard: the five morning numbers.
-- ---------------------------------------------------------------------------
create or replace function app.owner_numbers(p_day date default (now() at time zone 'Asia/Kolkata')::date)
returns table (new_enquiries bigint, visits_booked bigint, bookings bigint, revenue_collected_paise bigint, dues_paise bigint, overdue_paise bigint)
language sql stable security definer set search_path = pg_catalog, public, app as $$
  select
    (select count(*) from public.leads where (first_touch_at at time zone 'Asia/Kolkata')::date = p_day - 1),
    (select count(*) from public.visits where (created_at at time zone 'Asia/Kolkata')::date = p_day - 1),
    (select count(*) from public.weddings where booked_on = p_day - 1),
    (select coalesce(sum(paid_amount_paise), 0)::bigint from public.payments where status = 'paid' and (paid_at at time zone 'Asia/Kolkata')::date = p_day - 1),
    (select coalesce(sum(amount_paise), 0)::bigint from public.payments where status in ('scheduled', 'link_sent', 'overdue') and due_on between p_day and p_day + 30),
    (select coalesce(sum(amount_paise), 0)::bigint from public.payments where status in ('scheduled', 'link_sent', 'overdue') and due_on < p_day)
  where app.is_owner() or app.is_service()
$$;
create or replace function public.owner_numbers(p_day date default (now() at time zone 'Asia/Kolkata')::date)
returns table (new_enquiries bigint, visits_booked bigint, bookings bigint, revenue_collected_paise bigint, dues_paise bigint, overdue_paise bigint)
language sql stable set search_path = pg_catalog, public, app as $$ select * from app.owner_numbers(p_day) $$;
revoke execute on function public.owner_numbers(date) from public, anon;
grant execute on function public.owner_numbers(date) to authenticated, service_role;

-- Profit per wedding: revenue (paid) minus recorded costs. Owner/accounts only.
create or replace view public.wedding_profit with (security_invoker = true) as
select w.id as wedding_id, w.title, w.event_start,
       coalesce((select sum(p.paid_amount_paise) from public.payments p where p.wedding_id = w.id and p.status = 'paid'), 0) as revenue_paise,
       coalesce((select sum(c.amount_paise) from public.cost_entries c where c.wedding_id = w.id), 0) as cost_paise,
       coalesce((select sum(p.paid_amount_paise) from public.payments p where p.wedding_id = w.id and p.status = 'paid'), 0)
         - coalesce((select sum(c.amount_paise) from public.cost_entries c where c.wedding_id = w.id), 0) as profit_paise
  from public.weddings w
 where app.has_role('owner', 'accounts') or app.is_service();
grant select on public.wedding_profit to authenticated;

grant execute on all functions in schema app to authenticated, service_role;
