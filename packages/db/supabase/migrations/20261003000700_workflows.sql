-- =============================================================================
-- Wiwaha OS · 0007 · Messages timeline, sign-up roles, lead intake (dedupe),
-- portal stage cards, payment schedule, public RPC wrappers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Messages: one timeline per lead / Wedding Room, across every channel.
-- ---------------------------------------------------------------------------
create type public.message_channel as enum ('whatsapp', 'email', 'sms', 'instagram', 'portal', 'phone', 'internal');
create type public.message_status as enum ('draft', 'pending_approval', 'approved', 'queued', 'sent', 'delivered', 'read', 'failed', 'rejected', 'received');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  wedding_id uuid references public.weddings(id) on delete cascade,
  channel public.message_channel not null,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  status public.message_status not null,
  author_kind text not null check (author_kind in ('agent', 'staff', 'client', 'contact', 'system')),
  author_user_id uuid references public.profiles(id),
  agent_key text references public.agents(key),
  approval_id uuid references public.approvals(id) on delete set null,
  to_address text,
  subject text,
  body text not null,
  language public.language_code not null default 'en',
  client_visible boolean not null default false,  -- shown in the couple's portal
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lead_id is not null or wedding_id is not null)
);
create index messages_lead_idx on public.messages(lead_id, created_at desc);
create index messages_wedding_idx on public.messages(wedding_id, created_at desc);
create trigger messages_touch before update on public.messages
  for each row execute function app.touch_updated_at();

alter table public.messages enable row level security;
create policy messages_staff_read on public.messages for select
  using ((lead_id is not null and app.has_role('owner', 'sales', 'event_manager'))
      or (wedding_id is not null and app.staff_can_see_wedding(wedding_id))
      or (wedding_id is not null and client_visible and app.is_wedding_member(wedding_id)));
create policy messages_staff_write on public.messages for insert
  with check (app.has_role('owner', 'sales', 'event_manager'));
-- Clients post into their Wedding Room through the portal chat.
create policy messages_client_post on public.messages for insert
  with check (wedding_id is not null and app.is_wedding_member(wedding_id)
              and channel = 'portal' and direction = 'inbound' and author_kind = 'client'
              and author_user_id = auth.uid() and client_visible);
create policy messages_staff_update on public.messages for update
  using (app.has_role('owner', 'sales', 'event_manager'))
  with check (app.has_role('owner', 'sales', 'event_manager'));
select app.enable_audit('public.messages');

-- ---------------------------------------------------------------------------
-- New auth user → profile. Role comes from (in order): an open staff invite,
-- server-set app_metadata.role, or 'client'. Pending wedding memberships for
-- the same email are linked. Users can never choose their own role.
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_invite public.staff_invites;
  v_role public.app_role;
  v_name text;
begin
  select * into v_invite from public.staff_invites
   where email = new.email and accepted_at is null and revoked_at is null and expires_at > now()
   order by created_at desc limit 1;

  v_role := coalesce(
    v_invite.role,
    (new.raw_app_meta_data ->> 'role')::public.app_role,
    'client'
  );
  v_name := coalesce(nullif(v_invite.full_name, ''), new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));

  insert into public.profiles (id, email, full_name, role, title)
  values (new.id, new.email, v_name, v_role, v_invite.title)
  on conflict (id) do nothing;

  if v_invite.id is not null then
    update public.staff_invites set accepted_at = now() where id = v_invite.id;
  end if;

  update public.wedding_members
     set user_id = new.id, accepted_at = coalesce(accepted_at, now())
   where email = new.email and user_id is null;

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Lead intake with de-duplication by phone (and email when no phone).
-- Returns the lead and whether it was new. Used by the website form (service
-- role) and manual entry (sales/owner).
-- ---------------------------------------------------------------------------
-- Mirrors normalisePhone() in packages/db/src/format.ts (default country India).
create or replace function app.normalise_phone(p_raw text) returns text
language plpgsql immutable as $$
declare
  s text := regexp_replace(coalesce(p_raw, ''), '[[:space:]().-]', '', 'g');
begin
  if s = '' then return null; end if;
  if s like '00%' then s := '+' || substr(s, 3); end if;
  if s like '+%' then
    return case when substr(s, 2) ~ '^[1-9][0-9]{7,14}$' then s end;
  end if;
  s := ltrim(regexp_replace(s, '[^0-9]', '', 'g'), '0');
  if length(s) = 12 and s like '91%' and substr(s, 3, 1) ~ '[6-9]' then return '+' || s; end if;
  if length(s) = 10 and s ~ '^[6-9]' then return '+91' || s; end if;
  return null;
end $$;

create or replace function app.ingest_lead(p jsonb)
returns table (lead_id uuid, contact_id uuid, is_new_lead boolean, is_new_contact boolean)
language plpgsql security definer set search_path = public, app as $$
declare
  v_phone text := app.normalise_phone(p ->> 'phone_e164');
  v_email text := nullif(lower(trim(p ->> 'email')), '');
  v_source public.lead_source := coalesce(nullif(p ->> 'source', ''), 'website')::public.lead_source;
  v_contact uuid;
  v_lead uuid;
  v_new_contact boolean := false;
  v_new_lead boolean := false;
begin
  if not (app.is_service() or app.has_role('owner', 'sales')) then
    raise exception 'Not allowed to create leads' using errcode = '42501';
  end if;
  if v_phone is null and nullif(trim(p ->> 'phone_e164'), '') is not null then
    raise exception 'That phone number doesn''t look right';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'A lead needs a phone number or an email';
  end if;
  if coalesce(trim(p ->> 'full_name'), '') = '' then
    raise exception 'A lead needs a name';
  end if;

  -- 1. Find the person.
  if v_phone is not null then
    select c.id into v_contact from public.contacts c where c.phone_e164 = v_phone;
  end if;
  if v_contact is null and v_email is not null then
    select c.id into v_contact from public.contacts c
     where c.email = v_email::extensions.citext
       and (c.phone_e164 is null or v_phone is null)
     order by c.created_at limit 1;
  end if;

  if v_contact is null then
    insert into public.contacts (full_name, phone_e164, email, role, city, pincode,
                                 consent_whatsapp, consent_email, preferred_language)
    values (trim(p ->> 'full_name'), v_phone, v_email,
            coalesce(nullif(p ->> 'contact_role', ''), 'other')::public.contact_role,
            nullif(p ->> 'city', ''), nullif(p ->> 'pincode', ''),
            coalesce((p ->> 'consent_whatsapp')::boolean, false),
            coalesce((p ->> 'consent_email')::boolean, false),
            coalesce(nullif(p ->> 'language', ''), 'en')::public.language_code)
    returning id into v_contact;
    v_new_contact := true;
  else
    update public.contacts c
       set email = coalesce(c.email, v_email::extensions.citext),
           phone_e164 = coalesce(c.phone_e164, v_phone),
           city = coalesce(c.city, nullif(p ->> 'city', '')),
           consent_whatsapp = c.consent_whatsapp or coalesce((p ->> 'consent_whatsapp')::boolean, false),
           consent_email = c.consent_email or coalesce((p ->> 'consent_email')::boolean, false)
     where c.id = v_contact;
  end if;

  -- 2. Attach to their open lead, or open a new one.
  select l.id into v_lead from public.leads l
   where l.contact_id = v_contact and l.status not in ('won', 'lost', 'no_response')
   order by l.last_touch_at desc limit 1;

  if v_lead is null then
    insert into public.leads (contact_id, source, source_detail, event_type, date_wanted,
                              date_flexible, guest_count, budget_paise, budget_text,
                              rooms_needed, city, message)
    values (v_contact, v_source, nullif(p ->> 'source_detail', ''),
            coalesce(nullif(p ->> 'event_type', ''), 'wedding')::public.event_type,
            nullif(p ->> 'date_wanted', '')::date,
            coalesce((p ->> 'date_flexible')::boolean, false),
            nullif(p ->> 'guest_count', '')::integer,
            nullif(p ->> 'budget_paise', '')::bigint,
            nullif(p ->> 'budget_text', ''),
            nullif(p ->> 'rooms_needed', '')::integer,
            nullif(p ->> 'city', ''),
            nullif(p ->> 'message', ''))
    returning id into v_lead;
    v_new_lead := true;
  else
    update public.leads l
       set date_wanted = coalesce(nullif(p ->> 'date_wanted', '')::date, l.date_wanted),
           guest_count = coalesce(nullif(p ->> 'guest_count', '')::integer, l.guest_count),
           budget_paise = coalesce(nullif(p ->> 'budget_paise', '')::bigint, l.budget_paise),
           budget_text = coalesce(nullif(p ->> 'budget_text', ''), l.budget_text),
           city = coalesce(nullif(p ->> 'city', ''), l.city),
           message = coalesce(nullif(p ->> 'message', ''), l.message),
           touch_count = l.touch_count + 1,
           last_touch_at = now()
     where l.id = v_lead;
  end if;

  insert into public.lead_touches (lead_id, channel, direction, message, payload, external_ref)
  values (v_lead, v_source, 'inbound', nullif(p ->> 'message', ''), p, nullif(p ->> 'external_ref', ''));

  return query select v_lead, v_contact, v_new_lead, v_new_contact;
end $$;

-- ---------------------------------------------------------------------------
-- Stage cards. Definitions come from policy 'portal.stage_cards'.
-- ---------------------------------------------------------------------------
create or replace function app.stage_unlock_met(p_wedding uuid, p_rule text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select case p_rule
    when 'none' then true
    when 'deposit_paid' then exists (
      select 1 from public.payments where wedding_id = p_wedding and milestone = 'deposit' and status = 'paid')
    when 'contract_paid' then exists (
      select 1 from public.payments where wedding_id = p_wedding and milestone = 'contract' and status = 'paid')
    when 'brief_started' then exists (
      select 1 from public.wedding_stages where wedding_id = p_wedding and key = 'brief' and started_at is not null)
    when 'quote_approved' then exists (
      select 1 from public.quotes where wedding_id = p_wedding and status = 'client_approved')
    when 'event_complete' then exists (
      select 1 from public.weddings where id = p_wedding
        and (event_end < current_date or stage in ('close_out', 'offboarding')))
    else false
  end
$$;

-- Recompute locked/not_started for every card of a wedding (after payments etc.)
create or replace function app.refresh_stage_locks(p_wedding uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update public.wedding_stages s
     set status = case
           when app.stage_unlock_met(s.wedding_id, s.unlock_rule) then 'not_started'::public.stage_status
           else 'locked'::public.stage_status end
   where s.wedding_id = p_wedding
     and s.started_at is null
     and s.status in ('locked', 'not_started');
end $$;

create or replace function app.create_stage_cards(p_wedding uuid) returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  v_cards jsonb := coalesce(app.policy_value('portal.stage_cards') -> 'cards', '[]'::jsonb);
  v_event date;
  v_booked date;
  v_count integer;
begin
  select event_start, coalesce(booked_on, current_date) into v_event, v_booked
    from public.weddings where id = p_wedding;

  insert into public.wedding_stages (wedding_id, key, name, sort, recommended_start, unlock_rule, needs_from_client)
  select p_wedding,
         c ->> 'key',
         c ->> 'name',
         (ord)::integer,
         case
           when c ? 'recommended_days_before' then v_event - (c ->> 'recommended_days_before')::integer
           when c ? 'recommended_days_after' then v_event + (c ->> 'recommended_days_after')::integer
           else v_booked
         end,
         c ->> 'unlock',
         c ->> 'needs_from_client'
    from jsonb_array_elements(v_cards) with ordinality as t(c, ord)
  on conflict (wedding_id, key) do nothing;
  get diagnostics v_count = row_count;

  perform app.refresh_stage_locks(p_wedding);
  return v_count;
end $$;

-- The couple (or staff) presses Start. Early is fine; skipping the unlock is not.
create or replace function app.start_stage(p_stage_id uuid) returns public.wedding_stages
language plpgsql security definer set search_path = public, app as $$
declare
  v_stage public.wedding_stages;
begin
  select * into v_stage from public.wedding_stages where id = p_stage_id for update;
  if v_stage.id is null then
    raise exception 'Stage not found';
  end if;

  if not (app.is_service()
          or app.staff_can_edit_wedding(v_stage.wedding_id)
          or app.member_can(v_stage.wedding_id, 'start_stages')) then
    raise exception 'You do not have permission to start this stage' using errcode = '42501';
  end if;

  if v_stage.started_at is not null then
    return v_stage; -- idempotent
  end if;

  if not app.stage_unlock_met(v_stage.wedding_id, v_stage.unlock_rule) then
    raise exception 'This stage unlocks after: %', replace(v_stage.unlock_rule, '_', ' ')
      using errcode = 'P0001', hint = 'stage_locked';
  end if;

  update public.wedding_stages
     set started_at = now(), started_by = auth.uid(), status = 'in_progress',
         snoozed_until = null, snooze_reason = null
   where id = p_stage_id
   returning * into v_stage;

  -- Wake the agents for this stage via the Chief of Staff (never agent→agent).
  insert into public.agent_tasks (from_agent, kind, payload, wedding_id)
  values (null, 'stage_started',
          jsonb_build_object('stage_key', v_stage.key, 'stage_id', v_stage.id, 'started_by', auth.uid()),
          v_stage.wedding_id);

  perform app.refresh_stage_locks(v_stage.wedding_id);
  return v_stage;
end $$;

create or replace function app.snooze_stage(p_stage_id uuid, p_until date, p_reason text) returns public.wedding_stages
language plpgsql security definer set search_path = public, app as $$
declare
  v_stage public.wedding_stages;
begin
  select * into v_stage from public.wedding_stages where id = p_stage_id;
  if v_stage.id is null then raise exception 'Stage not found'; end if;
  if not (app.staff_can_edit_wedding(v_stage.wedding_id) or app.member_can(v_stage.wedding_id, 'start_stages')) then
    raise exception 'You do not have permission to snooze this stage' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Please tell us why you would like to snooze';
  end if;
  update public.wedding_stages
     set snoozed_until = p_until, snooze_reason = p_reason
   where id = p_stage_id returning * into v_stage;
  return v_stage;
end $$;

-- ---------------------------------------------------------------------------
-- Payment schedule from policy 'payments.schedule' (10/40/50 by default).
-- Rounding: earlier milestones round down to the rupee; the last takes the rest.
-- ---------------------------------------------------------------------------
create or replace function app.create_payment_schedule(p_wedding uuid, p_total_paise bigint) returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  v_ms jsonb := coalesce(app.policy_value('payments.schedule') -> 'milestones', '[]'::jsonb);
  v_w public.weddings;
  v_m jsonb;
  v_i integer := 0;
  v_n integer := jsonb_array_length(v_ms);
  v_allocated bigint := 0;
  v_amount bigint;
  v_due date;
begin
  if not (app.is_service() or app.has_role('owner', 'accounts', 'sales')) then
    raise exception 'Not allowed to create payment schedules' using errcode = '42501';
  end if;
  select * into v_w from public.weddings where id = p_wedding;
  if v_w.id is null then raise exception 'Wedding not found'; end if;

  for v_m in select * from jsonb_array_elements(v_ms) loop
    v_i := v_i + 1;
    if v_i = v_n then
      v_amount := p_total_paise - v_allocated;
    else
      v_amount := (p_total_paise * (v_m ->> 'percent_bps')::bigint / 10000) / 100 * 100;
    end if;
    v_allocated := v_allocated + v_amount;
    v_due := case v_m ->> 'due'
      when 'on_booking' then coalesce(v_w.booked_on, current_date)
      when 'days_after_booking' then coalesce(v_w.booked_on, current_date) + (v_m ->> 'days')::integer
      when 'days_before_event' then v_w.event_start - (v_m ->> 'days')::integer
      else coalesce(v_w.booked_on, current_date)
    end;
    insert into public.payments (wedding_id, milestone, label, percent_bps, amount_paise, due_on, sort)
    values (p_wedding, v_m ->> 'milestone', v_m ->> 'label', (v_m ->> 'percent_bps')::integer, v_amount, v_due, v_i * 10)
    on conflict (wedding_id, milestone) do nothing;
  end loop;

  update public.weddings set contract_value_paise = p_total_paise where id = p_wedding;
  return v_i;
end $$;

-- When a payment is marked paid, re-evaluate stage unlocks.
create or replace function app.on_payment_change() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.status is distinct from old.status then
    perform app.refresh_stage_locks(new.wedding_id);
  end if;
  return new;
end $$;
create trigger payments_refresh_stages after update on public.payments
  for each row execute function app.on_payment_change();

-- ---------------------------------------------------------------------------
-- Approval decision (approve / edit / reject). Applies the side effect for
-- the kinds that exist in Phase 1 and stamps the originating agent action.
-- ---------------------------------------------------------------------------
create or replace function app.decide_approval(
  p_approval_id uuid,
  p_decision public.approval_status,
  p_edited_payload jsonb default null,
  p_note text default null
) returns public.approvals
language plpgsql security definer set search_path = public, app as $$
declare
  v_a public.approvals;
  v_final jsonb;
begin
  if p_decision not in ('approved', 'edited', 'rejected') then
    raise exception 'Decision must be approved, edited or rejected';
  end if;
  select * into v_a from public.approvals where id = p_approval_id for update;
  if v_a.id is null then raise exception 'Approval not found'; end if;
  if not app.can_decide(v_a.kind) then
    raise exception 'You cannot decide this kind of approval' using errcode = '42501';
  end if;
  if v_a.status <> 'pending' then
    raise exception 'This item was already %', v_a.status;
  end if;
  if p_decision = 'edited' and p_edited_payload is null then
    raise exception 'An edit needs the edited content';
  end if;

  update public.approvals
     set status = p_decision,
         edited_payload = case when p_decision = 'edited' then p_edited_payload else null end,
         decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where id = p_approval_id
   returning * into v_a;

  update public.agent_actions
     set approved_by = case when p_decision <> 'rejected' then auth.uid() end,
         approved_at = case when p_decision <> 'rejected' then now() end
   where id = v_a.agent_action_id;

  v_final := coalesce(v_a.edited_payload, v_a.payload);

  -- Side effects for message-type approvals: the drafted message moves on.
  if v_a.kind in ('lead_reply', 'client_message') then
    update public.messages
       set status = case when p_decision = 'rejected' then 'rejected'::public.message_status
                         else 'approved'::public.message_status end,
           body = case when p_decision = 'edited' then coalesce(v_final ->> 'body', body) else body end,
           subject = case when p_decision = 'edited' then coalesce(v_final ->> 'subject', subject) else subject end
     where approval_id = v_a.id;
    if p_decision <> 'rejected' and v_a.lead_id is not null then
      update public.leads set status = 'contacted' where id = v_a.lead_id and status = 'new';
    end if;
  end if;

  return v_a;
end $$;

-- ---------------------------------------------------------------------------
-- Public RPC wrappers (PostgREST only exposes the public schema).
-- ---------------------------------------------------------------------------
create or replace function public.place_hold(
  p_resource_kind public.resource_kind, p_resource_id uuid, p_starts_on date, p_ends_on date,
  p_lead_id uuid default null, p_hours integer default null, p_label text default null, p_agent_key text default null
) returns public.calendar_entries language sql as $$
  select * from app.place_hold(p_resource_kind, p_resource_id, p_starts_on, p_ends_on, p_lead_id, p_hours, p_label, p_agent_key)
$$;

create or replace function public.set_calendar_status(
  p_entry_id uuid, p_status public.calendar_status, p_reason text default null, p_wedding_id uuid default null
) returns public.calendar_entries language sql as $$
  select * from app.set_calendar_status(p_entry_id, p_status, p_reason, p_wedding_id)
$$;

create or replace function public.availability(p_from date, p_to date)
returns table (resource_kind public.resource_kind, resource_id uuid, resource_name text, capacity integer,
               day date, status public.calendar_status, entry_id uuid, label text, expires_at timestamptz)
language sql stable as $$ select * from app.availability(p_from, p_to) $$;

create or replace function public.release_expired_holds() returns integer
language sql as $$ select app.release_expired_holds() $$;

create or replace function public.ingest_lead(p jsonb)
returns table (lead_id uuid, contact_id uuid, is_new_lead boolean, is_new_contact boolean)
language sql as $$ select * from app.ingest_lead(p) $$;

create or replace function public.start_stage(p_stage_id uuid) returns public.wedding_stages
language sql as $$ select * from app.start_stage(p_stage_id) $$;

create or replace function public.snooze_stage(p_stage_id uuid, p_until date, p_reason text) returns public.wedding_stages
language sql as $$ select * from app.snooze_stage(p_stage_id, p_until, p_reason) $$;

create or replace function public.decide_approval(
  p_approval_id uuid, p_decision public.approval_status, p_edited_payload jsonb default null, p_note text default null
) returns public.approvals language sql as $$
  select * from app.decide_approval(p_approval_id, p_decision, p_edited_payload, p_note)
$$;

create or replace function public.my_role() returns public.app_role
language sql stable as $$ select app.my_role() $$;

-- Only signed-in users / the server may call these.
revoke execute on function public.place_hold(public.resource_kind, uuid, date, date, uuid, integer, text, text) from public, anon;
revoke execute on function public.set_calendar_status(uuid, public.calendar_status, text, uuid) from public, anon;
revoke execute on function public.availability(date, date) from public, anon;
revoke execute on function public.release_expired_holds() from public, anon, authenticated;
revoke execute on function public.ingest_lead(jsonb) from public, anon;
revoke execute on function public.start_stage(uuid) from public, anon;
revoke execute on function public.snooze_stage(uuid, date, text) from public, anon;
revoke execute on function public.decide_approval(uuid, public.approval_status, jsonb, text) from public, anon;
grant execute on function public.place_hold(public.resource_kind, uuid, date, date, uuid, integer, text, text) to authenticated, service_role;
grant execute on function public.set_calendar_status(uuid, public.calendar_status, text, uuid) to authenticated, service_role;
grant execute on function public.availability(date, date) to authenticated, service_role;
grant execute on function public.release_expired_holds() to service_role;
grant execute on function public.ingest_lead(jsonb) to authenticated, service_role;
grant execute on function public.start_stage(uuid) to authenticated, service_role;
grant execute on function public.snooze_stage(uuid, date, text) to authenticated, service_role;
grant execute on function public.decide_approval(uuid, public.approval_status, jsonb, text) to authenticated, service_role;
grant execute on function public.my_role() to authenticated;

grant execute on all functions in schema app to authenticated, service_role;
