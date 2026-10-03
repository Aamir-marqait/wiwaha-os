-- =============================================================================
-- Wiwaha OS · 0005 · Availability calendar (spaces + rooms), soft holds
-- The calendar is the single truth: an exclusion constraint makes it
-- impossible for two blocking entries to overlap on the same space or room.
-- =============================================================================

create type public.calendar_status as enum ('enquiry', 'held', 'confirmed', 'released');
create type public.resource_kind as enum ('space', 'room');

create table public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  resource_kind public.resource_kind not null,
  space_id uuid references public.spaces(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  resource_id uuid generated always as (coalesce(space_id, room_id)) stored,
  starts_on date not null,
  ends_on date not null,                         -- inclusive
  during daterange generated always as (daterange(starts_on, ends_on, '[]')) stored,
  status public.calendar_status not null,
  label text,
  lead_id uuid references public.leads(id) on delete set null,
  wedding_id uuid references public.weddings(id) on delete set null,
  expires_at timestamptz,                        -- soft holds only
  released_at timestamptz,
  release_reason text,                           -- 'expired', 'manual', 'converted', 'lost'
  client_notified_at timestamptz,
  created_by uuid references public.profiles(id),
  created_by_agent text references public.agents(key),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check ((resource_kind = 'space' and space_id is not null and room_id is null)
      or (resource_kind = 'room' and room_id is not null and space_id is null)),
  check (status <> 'held' or expires_at is not null),
  -- Held and confirmed entries block the resource for everyone.
  constraint calendar_no_double_booking exclude using gist (
    resource_id with =,
    during with &&
  ) where (status in ('held', 'confirmed'))
);
create index calendar_entries_during_idx on public.calendar_entries using gist (during);
create index calendar_entries_expiry_idx on public.calendar_entries(expires_at) where status = 'held';
create index calendar_entries_lead_idx on public.calendar_entries(lead_id);
create index calendar_entries_wedding_idx on public.calendar_entries(wedding_id);
create trigger calendar_entries_touch before update on public.calendar_entries
  for each row execute function app.touch_updated_at();

alter table public.calendar_entries enable row level security;
-- Everyone on staff sees the calendar (it is the single source of truth).
create policy calendar_read on public.calendar_entries for select using (app.is_staff());
create policy calendar_write on public.calendar_entries for insert
  with check (app.has_role('owner', 'sales', 'event_manager'));
create policy calendar_update on public.calendar_entries for update
  using (app.has_role('owner', 'sales', 'event_manager'))
  with check (app.has_role('owner', 'sales', 'event_manager'));
select app.enable_audit('public.calendar_entries');

-- ---------------------------------------------------------------------------
-- Release expired holds (pg_cron every 15 min, and before every new hold).
-- Returns the number of holds released. Leads whose hold lapsed are flagged
-- for the client notification (Lead Desk drafts it).
-- ---------------------------------------------------------------------------
create or replace function app.release_expired_holds() returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  v_count integer;
begin
  with released as (
    update public.calendar_entries
       set status = 'released', released_at = now(), release_reason = 'expired'
     where status = 'held' and expires_at <= now()
     returning id, lead_id, label, starts_on, ends_on
  ), lead_upd as (
    update public.leads l
       set hold_expires_at = null
      from released r
     where r.lead_id = l.id
       and not exists (select 1 from public.calendar_entries c
                        where c.lead_id = l.id and c.status = 'held' and c.id <> r.id)
     returning l.id
  ), queued as (
    insert into public.agent_tasks (from_agent, kind, payload, lead_id)
    select null, 'hold_released_notify_client',
           jsonb_build_object('calendar_entry_id', r.id, 'starts_on', r.starts_on, 'ends_on', r.ends_on, 'label', r.label),
           r.lead_id
      from released r where r.lead_id is not null
    returning 1
  )
  select count(*) into v_count from released;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Place a soft hold. Length defaults to policy 'holds.soft_hold' → hours.
-- Raises 23P01 (exclusion_violation) with a friendly message when taken.
-- ---------------------------------------------------------------------------
create or replace function app.place_hold(
  p_resource_kind public.resource_kind,
  p_resource_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_lead_id uuid default null,
  p_hours integer default null,
  p_label text default null,
  p_agent_key text default null
) returns public.calendar_entries
language plpgsql security definer set search_path = public, app as $$
declare
  v_hours integer;
  v_entry public.calendar_entries;
begin
  if not (app.is_service() or app.has_role('owner', 'sales', 'event_manager')) then
    raise exception 'Not allowed to place holds' using errcode = '42501';
  end if;

  perform app.release_expired_holds();

  v_hours := coalesce(p_hours, (app.policy_value('holds.soft_hold') ->> 'hours')::integer, 72);
  if v_hours <= 0 then
    raise exception 'Hold length must be positive';
  end if;

  begin
    insert into public.calendar_entries
      (resource_kind, space_id, room_id, starts_on, ends_on, status, label, lead_id,
       expires_at, created_by, created_by_agent)
    values
      (p_resource_kind,
       case when p_resource_kind = 'space' then p_resource_id end,
       case when p_resource_kind = 'room' then p_resource_id end,
       p_starts_on, p_ends_on, 'held', p_label, p_lead_id,
       now() + make_interval(hours => v_hours), auth.uid(), p_agent_key)
    returning * into v_entry;
  exception when exclusion_violation then
    raise exception 'That date is already held or booked for this space/room'
      using errcode = '23P01';
  end;

  if p_lead_id is not null then
    update public.leads
       set hold_expires_at = greatest(coalesce(hold_expires_at, v_entry.expires_at), v_entry.expires_at)
     where id = p_lead_id;
  end if;

  return v_entry;
end $$;

-- Confirm a hold (e.g. when the 10% deposit lands) or release one manually.
create or replace function app.set_calendar_status(
  p_entry_id uuid,
  p_status public.calendar_status,
  p_reason text default null,
  p_wedding_id uuid default null
) returns public.calendar_entries
language plpgsql security definer set search_path = public, app as $$
declare
  v_entry public.calendar_entries;
begin
  if not (app.is_service() or app.has_role('owner', 'sales', 'event_manager')) then
    raise exception 'Not allowed to change the calendar' using errcode = '42501';
  end if;
  -- Confirming is a booking decision: owner or sales only.
  if p_status = 'confirmed' and not (app.is_service() or app.has_role('owner', 'sales')) then
    raise exception 'Only the owner or sales can confirm a booking' using errcode = '42501';
  end if;

  perform app.release_expired_holds();

  begin
    update public.calendar_entries
       set status = p_status,
           expires_at = case when p_status = 'held' then coalesce(expires_at, now() + interval '72 hours') else expires_at end,
           released_at = case when p_status = 'released' then now() else null end,
           release_reason = case when p_status = 'released' then coalesce(p_reason, 'manual') else null end,
           wedding_id = coalesce(p_wedding_id, wedding_id)
     where id = p_entry_id
     returning * into v_entry;
  exception when exclusion_violation then
    raise exception 'That date is already held or booked for this space/room'
      using errcode = '23P01';
  end;

  if v_entry.id is null then
    raise exception 'Calendar entry not found';
  end if;
  return v_entry;
end $$;

-- Availability for a date range: one row per active space/room with its blocking entry (if any).
create or replace function app.availability(p_from date, p_to date)
returns table (
  resource_kind public.resource_kind,
  resource_id uuid,
  resource_name text,
  capacity integer,
  day date,
  status public.calendar_status,
  entry_id uuid,
  label text,
  expires_at timestamptz
)
language sql stable security definer set search_path = public, app as $$
  with resources as (
    select 'space'::public.resource_kind as kind, s.id, s.name, s.capacity_seated as capacity, s.sort
      from public.spaces s where s.active
    union all
    select 'room'::public.resource_kind, r.id, 'Room ' || r.number, r.capacity, 1000 + r.sort
      from public.rooms r where r.active
  ), days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  )
  select r.kind, r.id, r.name, r.capacity, d.day,
         e.status, e.id, e.label, e.expires_at
    from resources r
   cross join days d
    left join lateral (
      select c.* from public.calendar_entries c
       where c.resource_id = r.id
         and c.during @> d.day
         and (c.status in ('confirmed', 'enquiry') or (c.status = 'held' and c.expires_at > now()))
       order by case c.status when 'confirmed' then 1 when 'held' then 2 else 3 end
       limit 1
    ) e on true
   where app.is_staff() or app.is_service()
   order by r.sort, r.name, d.day
$$;

-- Is a space free on a given date range? (used by Lead Desk scoring + voice agent)
create or replace function app.is_space_free(p_space uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = public, app as $$
  select not exists (
    select 1 from public.calendar_entries c
     where c.space_id = p_space
       and c.during && daterange(p_from, p_to, '[]')
       and (c.status = 'confirmed' or (c.status = 'held' and c.expires_at > now()))
  )
$$;

grant execute on function app.place_hold(public.resource_kind, uuid, date, date, uuid, integer, text, text) to authenticated, service_role;
grant execute on function app.set_calendar_status(uuid, public.calendar_status, text, uuid) to authenticated, service_role;
grant execute on function app.availability(date, date) to authenticated, service_role;
grant execute on function app.is_space_free(uuid, date, date) to authenticated, service_role;
grant execute on function app.release_expired_holds() to service_role;
