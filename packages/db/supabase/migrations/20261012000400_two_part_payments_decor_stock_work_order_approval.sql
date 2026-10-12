-- =============================================================================
-- Wiwaha OS · Two-part payments by default, décor stock and where it goes,
-- and vendor work orders that only we approve (D37)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- "books": one part that both holds the date and signs the contract (the 50%
-- advance in the two-part default).
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_effect_check;
alter table public.payments add constraint payments_effect_check
  check (effect is null or effect in ('holds_date', 'signs_contract', 'books', 'final', 'none'));

create or replace function app.stage_unlock_met(p_wedding uuid, p_rule text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select case p_rule
    when 'none' then true
    when 'deposit_paid' then exists (
      select 1 from public.payments p where p.wedding_id = p_wedding and p.status = 'paid' and app.payment_effect(p) in ('holds_date', 'books'))
    when 'contract_paid' then exists (
      select 1 from public.payments p where p.wedding_id = p_wedding and p.status = 'paid' and app.payment_effect(p) in ('signs_contract', 'books'))
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
    if v_effect in ('signs_contract', 'books') then
      update public.contracts set status = 'signed', signed_at = coalesce(signed_at, now())
       where wedding_id = new.wedding_id and status = 'sent';
    end if;
    insert into public.agent_tasks (kind, wedding_id, payload)
    values ('payment_received', new.wedding_id,
            jsonb_build_object('payment_id', new.id, 'milestone', new.milestone, 'effect', v_effect, 'amount_paise', new.paid_amount_paise));
  end if;
  return new;
end $$;

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
              where coalesce(nullif(x ->> 'effect', ''), 'none') not in ('holds_date', 'signs_contract', 'books', 'final', 'none')
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


-- The new standard split, as a versioned policy edit (fresh databases get it from the seed).
do $m$
begin
  perform set_config('app.change_note', 'Founders, 2026-10-12: two parts by default (50% advance books the date and signs the contract; 50% thirty days before). Prashanth can change it.', true);
  update public.policies
     set rule_text = 'Two parts: a 50% advance on booking holds the date and signs the contract; the other 50% is due 30 days before the event. This is the standard split; Prashanth can change it, or give a wedding its own parts.',
         value = jsonb_set(value, '{milestones}', '[{"milestone":"advance","label":"50% advance — books your date","percent_bps":5000,"due":"on_booking","effect":"books"},{"milestone":"final","label":"50% — final payment","percent_bps":5000,"due":"days_before_event","days":30,"effect":"final"}]'::jsonb)
   where key = 'payments.schedule' and jsonb_array_length(value -> 'milestones') = 3
     and value -> 'milestones' -> 0 ->> 'percent_bps' = '1000';
  update public.policies
     set rule_text = replace(rule_text, 'When the 10% deposit arrives', 'When the advance arrives')
   where key = 'onboarding.welcome' and rule_text like 'When the 10% deposit arrives%';
end $m$;

-- ---------------------------------------------------------------------------
-- Décor stock: every piece we own, photographed, with how many and its condition.
-- ---------------------------------------------------------------------------
create table public.decor_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  category text not null default 'other',
  photos jsonb not null default '[]'::jsonb,            -- [{url}]
  quantity integer not null default 1 check (quantity >= 0),
  condition text not null default 'good' check (condition in ('new', 'good', 'fair', 'needs_repair', 'damaged')),
  location text,                                         -- where it's stored
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger decor_items_touch before update on public.decor_items
  for each row execute function app.touch_updated_at();
alter table public.decor_items enable row level security;
create policy decor_items_read on public.decor_items for select using (app.is_staff());
create policy decor_items_write on public.decor_items for all
  using (app.has_role('owner', 'event_manager', 'staff')) with check (app.has_role('owner', 'event_manager', 'staff'));
select app.enable_audit('public.decor_items');

-- Where each piece goes: a wedding, optionally a function, and the area it dresses.
create table public.decor_assignments (
  id uuid primary key default gen_random_uuid(),
  decor_item_id uuid not null references public.decor_items(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid references public.event_functions(id) on delete set null,
  area text not null,                                    -- 'Main door entry', 'Lobby', 'Mandap'…
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'planned' check (status in ('planned', 'set_up', 'returned', 'cancelled')),
  return_condition text check (return_condition is null or return_condition in ('new', 'good', 'fair', 'needs_repair', 'damaged')),
  notes text,
  assigned_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index decor_assignments_item_idx on public.decor_assignments(decor_item_id);
create index decor_assignments_wedding_idx on public.decor_assignments(wedding_id);
create trigger decor_assignments_touch before update on public.decor_assignments
  for each row execute function app.touch_updated_at();
alter table public.decor_assignments enable row level security;
create policy decor_assignments_read on public.decor_assignments for select using (app.is_staff());
create policy decor_assignments_write on public.decor_assignments for all
  using (app.has_role('owner', 'event_manager', 'staff')) with check (app.has_role('owner', 'event_manager', 'staff'));
select app.enable_audit('public.decor_assignments');

-- A piece can't be promised to overlapping weddings beyond what we own.
create or replace function app.guard_decor_assignment() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_item public.decor_items; v_w public.weddings; v_used integer;
begin
  if new.status = 'cancelled' or new.status = 'returned' then return new; end if;
  select * into v_item from public.decor_items where id = new.decor_item_id;
  select * into v_w from public.weddings where id = new.wedding_id;
  select coalesce(sum(a.quantity), 0) into v_used
    from public.decor_assignments a join public.weddings w on w.id = a.wedding_id
   where a.decor_item_id = new.decor_item_id and a.id <> new.id and a.status in ('planned', 'set_up')
     and daterange(w.event_start, w.event_end, '[]') && daterange(v_w.event_start, v_w.event_end, '[]');
  if v_used + new.quantity > v_item.quantity then
    raise exception 'Only % of "%" free on those dates (we own %, % already promised)', greatest(v_item.quantity - v_used, 0), v_item.name, v_item.quantity, v_used
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger decor_assignments_guard before insert or update on public.decor_assignments
  for each row execute function app.guard_decor_assignment();

-- Coming back from an event updates the piece's condition.
create or replace function app.on_decor_returned() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  if new.status = 'returned' and old.status is distinct from 'returned' and new.return_condition is not null then
    update public.decor_items set condition = new.return_condition where id = new.decor_item_id;
  end if;
  return new;
end $$;
create trigger decor_assignments_on_return after update of status on public.decor_assignments
  for each row execute function app.on_decor_returned();

-- ---------------------------------------------------------------------------
-- Vendor work orders: nothing reaches a vendor until one of us approves it,
-- whatever an agent's autonomy setting.
-- ---------------------------------------------------------------------------
alter table public.vendor_bookings
  add column work_order_approved_at timestamptz,
  add column work_order_approved_by uuid references public.profiles(id);

create or replace function app.approve_work_order(p_booking uuid) returns public.vendor_bookings
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.vendor_bookings;
begin
  if not (app.has_role('owner', 'event_manager') or app.is_service()) then
    raise exception 'Only Prashanth or an event manager can approve a work order' using errcode = '42501';
  end if;
  update public.vendor_bookings
     set work_order_approved_at = coalesce(work_order_approved_at, now()), work_order_approved_by = coalesce(work_order_approved_by, auth.uid())
   where id = p_booking returning * into v;
  if v.id is null then raise exception 'Work order not found'; end if;
  insert into public.agent_tasks (kind, wedding_id, payload)
  values ('work_order_approved', v.wedding_id, jsonb_build_object('booking_id', v.id));
  return v;
end $$;
create or replace function public.approve_work_order(p_booking uuid) returns public.vendor_bookings
language sql set search_path = pg_catalog, public, app as $$ select * from app.approve_work_order(p_booking) $$;
revoke execute on function public.approve_work_order(uuid) from public, anon;
grant execute on function public.approve_work_order(uuid) to authenticated, service_role;

-- Bookings made before this change were already sent under the old flow.
update public.vendor_bookings set work_order_approved_at = coalesce(requested_at, now()) where work_order_approved_at is null;

-- Estate staff photograph décor stock too.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $p$create policy library_upload_staff on storage.objects for insert to authenticated
      with check (bucket_id = 'library' and app.has_role('staff'))$p$;
  end if;
end $$;
