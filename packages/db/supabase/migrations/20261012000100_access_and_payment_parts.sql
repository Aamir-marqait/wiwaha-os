-- =============================================================================
-- Wiwaha OS · Access by section, and payment parts set by Prashanth (D34)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Per-person sections. NULL = the defaults for their role (apps/web lib/sections.ts).
-- Sections decide what a person sees in the team app; what they may read or
-- change is still decided by their role through RLS.
-- ---------------------------------------------------------------------------
alter table public.profiles add column sections text[];

create or replace function app.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active
      or new.sections is distinct from old.sections)
     and not (app.is_owner() or app.is_service()) then
    raise exception 'Only the owner can change roles, access or deactivate users'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Payment parts. Each part carries what it unlocks, so a wedding can have its
-- own split (e.g. a 25% advance, or four parts) without changing the policy.
-- ---------------------------------------------------------------------------
alter table public.payments add column effect text
  check (effect is null or effect in ('holds_date', 'signs_contract', 'final', 'none'));

update public.payments p
   set effect = coalesce((
     select m ->> 'effect'
       from jsonb_array_elements(coalesce(app.policy_value('payments.schedule') -> 'milestones', '[]'::jsonb)) m
      where m ->> 'milestone' = p.milestone limit 1), 'none')
 where p.effect is null;

create or replace function app.payment_effect(p public.payments) returns text
language sql stable security definer set search_path = public, app as $$
  select coalesce(p.effect, (
    select m ->> 'effect'
      from jsonb_array_elements(coalesce(app.policy_value('payments.schedule') -> 'milestones', '[]'::jsonb)) m
     where m ->> 'milestone' = p.milestone limit 1), 'none')
$$;

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
    insert into public.payments (wedding_id, milestone, label, percent_bps, amount_paise, due_on, sort, effect)
    values (p_wedding, v_m ->> 'milestone', v_m ->> 'label', (v_m ->> 'percent_bps')::integer, v_amount, v_due, v_i * 10,
            coalesce(nullif(v_m ->> 'effect', ''), 'none'))
    on conflict (wedding_id, milestone) do nothing;
  end loop;

  update public.weddings set contract_value_paise = p_total_paise where id = p_wedding;
  return v_i;
end $$;

-- Unlocks read the part's own effect, not its name.
create or replace function app.stage_unlock_met(p_wedding uuid, p_rule text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select case p_rule
    when 'none' then true
    when 'deposit_paid' then exists (
      select 1 from public.payments p where p.wedding_id = p_wedding and p.status = 'paid' and app.payment_effect(p) = 'holds_date')
    when 'contract_paid' then exists (
      select 1 from public.payments p where p.wedding_id = p_wedding and p.status = 'paid' and app.payment_effect(p) = 'signs_contract')
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
    v_effect := app.payment_effect(new);
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

-- Prashanth sets a wedding's own parts. p_parts: [{id?, label, percent_bps, due_on, effect}]
-- in order. Paid parts can't change; the parts must add up to 100%; the last
-- part takes any rounding so the amounts always add up to the contract value.
create or replace function app.set_payment_parts(p_wedding uuid, p_parts jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare
  v_w public.weddings;
  v_total bigint;
  v_sum integer;
  v_n integer := jsonb_array_length(coalesce(p_parts, '[]'::jsonb));
  v_part jsonb;
  v_i integer := 0;
  v_allocated bigint := 0;
  v_amount bigint;
  v_id uuid;
  v_old public.payments;
  v_keep uuid[] := '{}';
  v_key text;
begin
  if not (app.is_owner() or app.is_service()) then
    raise exception 'Only Prashanth can change payment parts' using errcode = '42501';
  end if;
  select * into v_w from public.weddings where id = p_wedding for update;
  if v_w.id is null then raise exception 'Wedding not found'; end if;
  if v_n = 0 then raise exception 'Add at least one payment part'; end if;
  v_total := coalesce(v_w.contract_value_paise, (select sum(amount_paise) from public.payments where wedding_id = p_wedding), 0);
  if v_total <= 0 then raise exception 'Set the contract value before splitting it into parts'; end if;

  select sum((x ->> 'percent_bps')::integer) into v_sum from jsonb_array_elements(p_parts) x;
  if v_sum is distinct from 10000 then
    raise exception 'The parts add up to %, they must add up to 100%%', round(coalesce(v_sum, 0) / 100.0, 2) || '%';
  end if;
  if exists (select 1 from jsonb_array_elements(p_parts) x
              where coalesce(nullif(x ->> 'effect', ''), 'none') not in ('holds_date', 'signs_contract', 'final', 'none')
                 or nullif(trim(x ->> 'label'), '') is null
                 or (x ->> 'due_on') is null
                 or (x ->> 'percent_bps')::integer < 0) then
    raise exception 'Each part needs a name, a percentage, a due date and what it unlocks';
  end if;

  -- Paid parts must come through unchanged.
  for v_old in select * from public.payments where wedding_id = p_wedding and status = 'paid' loop
    if not exists (select 1 from jsonb_array_elements(p_parts) x
                    where (x ->> 'id') = v_old.id::text and (x ->> 'percent_bps')::integer = coalesce(v_old.percent_bps, -1)) then
      raise exception '"%" is already paid and can''t be changed or removed', v_old.label;
    end if;
  end loop;

  -- Free the names of parts being replaced so new ones can reuse them.
  for v_part in select * from jsonb_array_elements(p_parts) loop
    if (v_part ->> 'id') is not null then v_keep := v_keep || (v_part ->> 'id')::uuid; end if;
  end loop;
  delete from public.payments
   where wedding_id = p_wedding and status <> 'paid' and not (id = any(v_keep));

  for v_part in select * from jsonb_array_elements(p_parts) loop
    v_i := v_i + 1;
    if v_i = v_n then v_amount := v_total - v_allocated;
    else v_amount := (v_total * (v_part ->> 'percent_bps')::bigint / 10000) / 100 * 100;
    end if;
    v_allocated := v_allocated + v_amount;
    v_id := nullif(v_part ->> 'id', '')::uuid;
    select * into v_old from public.payments where id = v_id and wedding_id = p_wedding;
    if v_old.id is not null and v_old.status = 'paid' then
      update public.payments set sort = v_i * 10 where id = v_old.id;
    elsif v_old.id is not null then
      update public.payments
         set label = trim(v_part ->> 'label'), percent_bps = (v_part ->> 'percent_bps')::integer,
             amount_paise = v_amount, due_on = (v_part ->> 'due_on')::date, sort = v_i * 10,
             effect = coalesce(nullif(v_part ->> 'effect', ''), 'none'),
             -- a changed amount needs a fresh link
             link_url = case when amount_paise = v_amount then link_url end,
             link_id = case when amount_paise = v_amount then link_id end,
             status = case when status = 'link_sent' and amount_paise <> v_amount then 'scheduled'::public.payment_status else status end
       where id = v_old.id;
    else
      v_key := 'part_' || v_i;
      while exists (select 1 from public.payments where wedding_id = p_wedding and milestone = v_key) loop
        v_key := v_key || 'b';
      end loop;
      insert into public.payments (wedding_id, milestone, label, percent_bps, amount_paise, due_on, sort, effect)
      values (p_wedding, v_key, trim(v_part ->> 'label'), (v_part ->> 'percent_bps')::integer, v_amount,
              (v_part ->> 'due_on')::date, v_i * 10, coalesce(nullif(v_part ->> 'effect', ''), 'none'));
    end if;
  end loop;

  perform app.refresh_stage_locks(p_wedding);
  return v_n;
end $$;

create or replace function public.set_payment_parts(p_wedding uuid, p_parts jsonb) returns integer
language sql set search_path = pg_catalog, public, app as $$ select app.set_payment_parts(p_wedding, p_parts) $$;
revoke execute on function public.set_payment_parts(uuid, jsonb) from public, anon;
grant execute on function public.set_payment_parts(uuid, jsonb) to authenticated, service_role;
