-- =============================================================================
-- Wiwaha OS · 0014 · Phase 3 (Wedding Room and client portal)
-- Booking conversion, contract approval + e-sign, payment links + receipts,
-- the guided brief, menu library, moodboard shortlist, quote approval,
-- vendor lock-in replies, the Wedding Room decision log, and portal unlock
-- rules enforced in the database (not just the UI).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Portal unlocks, enforced for every write a client can make.
-- A stage is "open" for a client when it has been started (which itself
-- required its unlock condition, see app.start_stage). Staff and the service
-- role bypass, because they work ahead of the couple.
-- ---------------------------------------------------------------------------
create or replace function app.stage_open(p_wedding uuid, p_key text) returns boolean
language sql stable security definer set search_path = pg_catalog, public, app as $$
  select exists (
    select 1 from public.wedding_stages s
     where s.wedding_id = p_wedding and s.key = p_key and s.started_at is not null
       and app.stage_unlock_met(p_wedding, s.unlock_rule)
  )
$$;

create or replace function app.require_stage_open(p_wedding uuid, p_key text) returns void
language plpgsql stable security definer set search_path = pg_catalog, public, app as $$
declare v_rule text;
begin
  if app.is_service() or app.is_staff() then return; end if;
  if not app.stage_open(p_wedding, p_key) then
    select unlock_rule into v_rule from public.wedding_stages where wedding_id = p_wedding and key = p_key;
    raise exception 'This part of your planning opens after: %', replace(coalesce(v_rule, p_key), '_', ' ')
      using errcode = 'P0001', hint = 'stage_locked';
  end if;
end $$;

-- Décor work can't exist before décor's unlock, whoever writes it (agents included).
create or replace function app.guard_moodboard() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_rule text;
begin
  select unlock_rule into v_rule from public.wedding_stages where wedding_id = new.wedding_id and key = 'decor';
  if not app.stage_unlock_met(new.wedding_id, coalesce(v_rule, 'contract_paid')) then
    raise exception 'Décor opens after: %', replace(coalesce(v_rule, 'contract_paid'), '_', ' ')
      using errcode = 'P0001', hint = 'stage_locked';
  end if;
  return new;
end $$;
create trigger moodboards_guard_unlock before insert on public.moodboards
  for each row execute function app.guard_moodboard();

create or replace function app.guard_function_write() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  perform app.require_stage_open(coalesce(new.wedding_id, old.wedding_id), 'brief');
  return coalesce(new, old);
end $$;
create trigger event_functions_guard_unlock before insert or update or delete on public.event_functions
  for each row execute function app.guard_function_write();

create or replace function app.guard_rooming_write() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  perform app.require_stage_open(coalesce(new.wedding_id, old.wedding_id), 'guests_rooms');
  return coalesce(new, old);
end $$;
create trigger room_allocations_guard_unlock before insert or update or delete on public.room_allocations
  for each row execute function app.guard_rooming_write();

-- ---------------------------------------------------------------------------
-- Booking conversion: "Mark as booked" turns a lead into a Wedding Room.
-- ---------------------------------------------------------------------------
create sequence public.wedding_code_seq;

create or replace function app.mark_lead_booked(
  p_lead_id uuid,
  p_event_start date,
  p_event_end date,
  p_contract_total_paise bigint,
  p_event_manager_id uuid,
  p_title text default null
) returns public.weddings
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare
  v_lead public.leads;
  v_contact public.contacts;
  v_w public.weddings;
begin
  if not (app.is_service() or app.has_role('owner', 'sales')) then
    raise exception 'Only the owner or sales can mark a booking' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Lead not found'; end if;
  if v_lead.wedding_id is not null then
    select * into v_w from public.weddings where id = v_lead.wedding_id;
    return v_w; -- idempotent
  end if;
  if p_event_end < p_event_start then raise exception 'The event must end on or after its first day'; end if;
  if p_contract_total_paise <= 0 then raise exception 'Enter the contract value'; end if;
  select * into v_contact from public.contacts where id = v_lead.contact_id;

  insert into public.weddings (code, title, lead_id, primary_contact_id, event_start, event_end, guest_count,
                               stage, status, event_manager_id, sales_owner_id, booked_on)
  values ('WIW-' || to_char(p_event_start, 'YYYY') || '-' || lpad(nextval('public.wedding_code_seq')::text, 3, '0'),
          coalesce(nullif(trim(p_title), ''), v_contact.full_name),
          v_lead.id, v_contact.id, p_event_start, p_event_end, v_lead.guest_count,
          'booking', 'active', p_event_manager_id, coalesce(v_lead.assigned_to, auth.uid()), current_date)
  returning * into v_w;

  update public.leads set status = 'won', wedding_id = v_w.id, hold_expires_at = null where id = v_lead.id;

  -- Held dates for this lead become confirmed bookings on the master calendar.
  update public.calendar_entries
     set status = 'confirmed', wedding_id = v_w.id, expires_at = null, label = v_w.title
   where lead_id = v_lead.id and status = 'held';

  insert into public.wedding_contacts (wedding_id, contact_id, relation, is_key_contact)
  values (v_w.id, v_contact.id, initcap(v_contact.role::text), true)
  on conflict do nothing;

  if v_contact.email is not null then
    insert into public.wedding_members (wedding_id, contact_id, email, display_name, member_role,
                                        can_start_stages, can_edit_brief, can_approve, can_view_payments, can_manage_members)
    values (v_w.id, v_contact.id, v_contact.email, split_part(v_contact.full_name, ' ', 1), 'couple', true, true, true, true, true)
    on conflict (wedding_id, email) do nothing;
  end if;

  perform app.create_payment_schedule(v_w.id, p_contract_total_paise);
  perform app.create_stage_cards(v_w.id);

  insert into public.agent_tasks (kind, wedding_id, lead_id, payload)
  values ('wedding_booked', v_w.id, v_lead.id, jsonb_build_object('booked_by', auth.uid()));
  return v_w;
end $$;

create or replace function public.mark_lead_booked(
  p_lead_id uuid, p_event_start date, p_event_end date, p_contract_total_paise bigint, p_event_manager_id uuid, p_title text default null
) returns public.weddings language sql set search_path = pg_catalog, public, app as $$
  select * from app.mark_lead_booked(p_lead_id, p_event_start, p_event_end, p_contract_total_paise, p_event_manager_id, p_title)
$$;
revoke execute on function public.mark_lead_booked(uuid, date, date, bigint, uuid, text) from public, anon;
grant execute on function public.mark_lead_booked(uuid, date, date, bigint, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Contracts: owner approval before sending, e-sign tracking.
-- ---------------------------------------------------------------------------
alter table public.contracts
  add column approval_id uuid references public.approvals(id) on delete set null,
  add column esign_url text,
  add column esign_completed_at timestamptz;

-- A contract can't go out until Prashanth has approved it.
create or replace function app.guard_contract_send() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  if new.status in ('sent', 'signed') and old.status not in ('sent', 'signed')
     and (app.policy_value('contracts.process') ->> 'owner_approves_before_send')::boolean is not false
     and not exists (select 1 from public.approvals a where a.id = new.approval_id and a.status in ('approved', 'edited')) then
    raise exception 'Prashanth must approve this contract before it is sent' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger contracts_guard_send before update of status on public.contracts
  for each row execute function app.guard_contract_send();

-- ---------------------------------------------------------------------------
-- Payments: links, receipts and the effects of each milestone.
-- ---------------------------------------------------------------------------
create sequence public.receipt_seq;
alter table public.payments
  add column link_id text,
  add column receipt_number text unique,
  add column receipt_sent_at timestamptz;

create or replace function app.on_payment_paid() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_effect text;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if new.receipt_number is null then
      new.receipt_number := 'RCPT-' || to_char(coalesce(new.paid_at, now()) at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 5, '0');
    end if;
    new.paid_at := coalesce(new.paid_at, now());
    new.paid_amount_paise := coalesce(new.paid_amount_paise, new.amount_paise);
    select m ->> 'effect' into v_effect
      from jsonb_array_elements(coalesce(app.policy_value('payments.schedule') -> 'milestones', '[]'::jsonb)) m
     where m ->> 'milestone' = new.milestone;
    -- "40% within two weeks signs the contract" (policy 'payments.schedule').
    if v_effect = 'signs_contract' then
      update public.contracts set status = 'signed', signed_at = coalesce(signed_at, now())
       where wedding_id = new.wedding_id and status = 'sent';
    end if;
    insert into public.agent_tasks (kind, wedding_id, payload)
    values ('payment_received', new.wedding_id,
            jsonb_build_object('payment_id', new.id, 'milestone', new.milestone, 'effect', v_effect, 'amount_paise', new.paid_amount_paise));
  end if;
  return new;
end $$;
create trigger payments_on_paid before update of status on public.payments
  for each row execute function app.on_payment_paid();

-- ---------------------------------------------------------------------------
-- The guided brief (one per wedding). Functions themselves are event_functions.
-- ---------------------------------------------------------------------------
create table public.wedding_briefs (
  wedding_id uuid primary key references public.weddings(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed')),
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger wedding_briefs_touch before update on public.wedding_briefs
  for each row execute function app.touch_updated_at();
create or replace function app.guard_brief_write() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  perform app.require_stage_open(new.wedding_id, 'brief');
  return new;
end $$;
create trigger wedding_briefs_guard_unlock before insert or update on public.wedding_briefs
  for each row execute function app.guard_brief_write();
alter table public.wedding_briefs enable row level security;
create policy wedding_briefs_read on public.wedding_briefs for select using (app.can_see_wedding(wedding_id));
create policy wedding_briefs_write on public.wedding_briefs for all
  using (app.staff_can_edit_wedding(wedding_id) or app.member_can(wedding_id, 'edit_brief'))
  with check (app.staff_can_edit_wedding(wedding_id) or app.member_can(wedding_id, 'edit_brief'));
select app.enable_audit('public.wedding_briefs');

-- ---------------------------------------------------------------------------
-- Menus: a library to build from, tasting and plate-count lock; the couple
-- approves a proposed menu through an RPC (menus stage must be open).
-- ---------------------------------------------------------------------------
create table public.menu_library (
  id uuid primary key default gen_random_uuid(),
  cuisine text not null,
  course text not null,
  name text not null,
  is_veg boolean not null default true,
  active boolean not null default true,
  sort integer not null default 100,
  unique (cuisine, course, name)
);
alter table public.menu_library enable row level security;
create policy menu_library_read on public.menu_library for select using (auth.uid() is not null or app.is_service());
create policy menu_library_write on public.menu_library for all
  using (app.has_role('owner', 'event_manager')) with check (app.has_role('owner', 'event_manager'));

alter table public.menus
  add column tasting_status text not null default 'none' check (tasting_status in ('none', 'requested', 'booked', 'done')),
  add column plate_count_lock_on date,
  add column plate_count_locked_at timestamptz,
  add column approval_id uuid references public.approvals(id) on delete set null,
  add column client_approved_at timestamptz,
  add column client_approved_by uuid references public.profiles(id);

create or replace function app.client_approve_menu(p_menu_id uuid, p_note text default null) returns public.menus
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.menus;
begin
  select * into v from public.menus where id = p_menu_id for update;
  if v.id is null then raise exception 'Menu not found'; end if;
  if not (app.member_can(v.wedding_id, 'approve') or app.staff_can_edit_wedding(v.wedding_id)) then
    raise exception 'You do not have permission to approve menus' using errcode = '42501';
  end if;
  perform app.require_stage_open(v.wedding_id, 'menus');
  if v.status <> 'proposed' then raise exception 'This menu is not waiting for your approval'; end if;
  update public.menus set status = 'client_approved', client_approved_at = now(), client_approved_by = auth.uid(),
         notes = coalesce(nullif(p_note, ''), notes)
   where id = p_menu_id returning * into v;
  insert into public.agent_tasks (kind, wedding_id, payload) values ('menu_approved', v.wedding_id, jsonb_build_object('menu_id', v.id));
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Moodboards: couple shortlists (décor stage open), décor lead finalises,
-- Prashanth approves custom work.
-- ---------------------------------------------------------------------------
alter table public.moodboards
  add column shortlisted_at timestamptz,
  add column shortlisted_by uuid references public.profiles(id),
  add column approval_id uuid references public.approvals(id) on delete set null,
  add column parent_id uuid references public.moodboards(id) on delete set null;

create or replace function app.client_shortlist_moodboard(p_id uuid, p_shortlist boolean, p_feedback text default null) returns public.moodboards
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.moodboards;
begin
  select * into v from public.moodboards where id = p_id for update;
  if v.id is null then raise exception 'Moodboard not found'; end if;
  if not (app.member_can(v.wedding_id, 'approve') or app.staff_can_edit_wedding(v.wedding_id)) then
    raise exception 'You do not have permission to shortlist moodboards' using errcode = '42501';
  end if;
  perform app.require_stage_open(v.wedding_id, 'decor');
  if v.status not in ('generated', 'shortlisted', 'rejected') then raise exception 'This moodboard is already being finalised'; end if;
  update public.moodboards
     set status = case when p_shortlist then 'shortlisted'::public.moodboard_status else 'rejected'::public.moodboard_status end,
         shortlisted_at = case when p_shortlist then now() end,
         shortlisted_by = case when p_shortlist then auth.uid() end,
         client_feedback = coalesce(nullif(p_feedback, ''), client_feedback)
   where id = p_id returning * into v;
  if p_shortlist then
    insert into public.agent_tasks (kind, wedding_id, payload) values ('moodboard_shortlisted', v.wedding_id, jsonb_build_object('moodboard_id', v.id, 'function_id', v.function_id));
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Quotes: off-book lines and custom décor need Prashanth before the couple
-- sees the quote; the couple approves in the portal.
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column approval_id uuid references public.approvals(id) on delete set null,
  add column sent_at timestamptz;

create or replace function app.quote_needs_owner(p_quote uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, app as $$
  select exists (
    select 1 from public.quote_lines ql
      left join public.price_book_items pb on pb.id = ql.price_book_item_id
     where ql.quote_id = p_quote and (ql.off_book or pb.design_kind = 'custom')
  )
$$;

create or replace function app.guard_quote_send() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  if new.status = 'sent' and old.status is distinct from 'sent' then
    if app.quote_needs_owner(new.id)
       and not exists (select 1 from public.approvals a where a.id = new.approval_id and a.status in ('approved', 'edited')) then
      raise exception 'This quote has off-book or custom lines and needs Prashanth''s approval first' using errcode = 'P0001';
    end if;
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  return new;
end $$;
create trigger quotes_guard_send before update of status on public.quotes
  for each row execute function app.guard_quote_send();

create or replace function app.client_approve_quote(p_quote_id uuid) returns public.quotes
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.quotes;
begin
  select * into v from public.quotes where id = p_quote_id for update;
  if v.id is null then raise exception 'Quote not found'; end if;
  if not app.member_can(v.wedding_id, 'approve') and not app.is_owner() then
    raise exception 'You do not have permission to approve the quote' using errcode = '42501';
  end if;
  if v.status <> 'sent' then raise exception 'This quote is not waiting for your approval'; end if;
  update public.quotes set status = 'superseded' where wedding_id = v.wedding_id and status = 'client_approved';
  update public.quotes set status = 'client_approved', client_approved_at = now(), client_approved_by = auth.uid()
   where id = p_quote_id returning * into v;
  perform app.refresh_stage_locks(v.wedding_id);
  insert into public.agent_tasks (kind, wedding_id, payload) values ('quote_approved', v.wedding_id, jsonb_build_object('quote_id', v.id));
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Vendor lock-in: vendors answer through a private link (token), chased on
-- a schedule by the Vendor Coordinator.
-- ---------------------------------------------------------------------------
alter table public.vendor_bookings
  add column reply_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  add column chase_count integer not null default 0,
  add column last_chased_at timestamptz,
  add column replied_at timestamptz,
  add column reply_note text;
create unique index vendor_bookings_token_idx on public.vendor_bookings(reply_token);
create unique index vendor_bookings_one_per_wedding on public.vendor_bookings(wedding_id, vendor_id, coalesce(function_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- Wedding Room: decisions logged from the family WhatsApp group and portal.
-- ---------------------------------------------------------------------------
create table public.wedding_decisions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  topic text not null,
  decision text not null,
  decided_by_name text,
  source text not null default 'whatsapp' check (source in ('whatsapp', 'portal', 'call', 'meeting')),
  message_id uuid references public.messages(id) on delete set null,
  logged_by_agent text references public.agents(key),
  created_at timestamptz not null default now()
);
create index wedding_decisions_wedding_idx on public.wedding_decisions(wedding_id, created_at desc);
alter table public.wedding_decisions enable row level security;
create policy wedding_decisions_read on public.wedding_decisions for select using (app.can_see_wedding(wedding_id));
create policy wedding_decisions_write on public.wedding_decisions for insert
  with check (app.staff_can_edit_wedding(wedding_id));
select app.enable_audit('public.wedding_decisions');

-- ---------------------------------------------------------------------------
-- Who may decide each kind of approval. Owner decides everything; the rest
-- follow the human gates in PRD §8.
-- ---------------------------------------------------------------------------
create or replace function app.can_decide(p_kind public.approval_kind) returns boolean
language sql stable security definer set search_path = pg_catalog, public, app as $$
  select app.is_owner()
      or (p_kind in ('lead_reply', 'visit_message', 'review_reply', 'social_post') and app.has_role('sales'))
      or (p_kind in ('brief', 'client_message', 'menu', 'moodboard', 'vendor_message', 'run_of_show', 't_minus_plan') and app.has_role('event_manager'))
      or (p_kind in ('invoice') and app.has_role('accounts'))
$$;

-- ---------------------------------------------------------------------------
-- When a human decides an approval, the agent that asked for it gets a task
-- (routed by the Chief of Staff) to carry out the consequence: send the
-- contract, release the quote, post the review reply, order the purchase...
-- Plain message approvals are sent by the outbox sender instead.
-- ---------------------------------------------------------------------------
create or replace function app.on_approval_decided() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'edited', 'rejected')
     and new.agent_key is not null
     and new.kind not in ('lead_reply', 'client_message', 'visit_message', 'vendor_message') then
    insert into public.agent_tasks (kind, lead_id, wedding_id, payload)
    values ('approval_decided', new.lead_id, new.wedding_id,
            jsonb_build_object('approval_id', new.id, 'kind', new.kind, 'status', new.status, 'agent_key', new.agent_key));
  end if;
  return new;
end $$;
create trigger approvals_on_decided after update of status on public.approvals
  for each row execute function app.on_approval_decided();

-- decide_approval moves drafted messages on for every message-type approval.
create or replace function app.release_approved_message() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_final jsonb;
begin
  if old.status = 'pending' and new.status in ('approved', 'edited', 'rejected')
     and new.kind in ('visit_message', 'vendor_message') then
    v_final := coalesce(new.edited_payload, new.payload);
    update public.messages
       set status = case when new.status = 'rejected' then 'rejected'::public.message_status else 'approved'::public.message_status end,
           body = case when new.status = 'edited' then coalesce(v_final ->> 'body', body) else body end
     where approval_id = new.id;
  end if;
  return new;
end $$;
create trigger approvals_release_message after update of status on public.approvals
  for each row execute function app.release_approved_message();

-- ---------------------------------------------------------------------------
-- Public wrappers for the portal RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.client_approve_menu(p_menu_id uuid, p_note text default null) returns public.menus
language sql set search_path = pg_catalog, public, app as $$ select * from app.client_approve_menu(p_menu_id, p_note) $$;
create or replace function public.client_shortlist_moodboard(p_id uuid, p_shortlist boolean, p_feedback text default null) returns public.moodboards
language sql set search_path = pg_catalog, public, app as $$ select * from app.client_shortlist_moodboard(p_id, p_shortlist, p_feedback) $$;
create or replace function public.client_approve_quote(p_quote_id uuid) returns public.quotes
language sql set search_path = pg_catalog, public, app as $$ select * from app.client_approve_quote(p_quote_id) $$;
revoke execute on function public.client_approve_menu(uuid, text) from public, anon;
revoke execute on function public.client_shortlist_moodboard(uuid, boolean, text) from public, anon;
revoke execute on function public.client_approve_quote(uuid) from public, anon;
grant execute on function public.client_approve_menu(uuid, text) to authenticated, service_role;
grant execute on function public.client_shortlist_moodboard(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.client_approve_quote(uuid) to authenticated, service_role;

grant execute on all functions in schema app to authenticated, service_role;
