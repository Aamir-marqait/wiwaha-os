-- =============================================================================
-- Wiwaha OS · Verticals: entertainment and extras, décor templates by area,
-- the ideas wall, and planning that opens 90 days before (D35)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Options the venue offers: entertainment (DJ, band, dhol, anchor…) and extras
-- (makeup, laundry, welcome drinks…). The couple only ever picks from these.
-- rate_paise is the prescribed price; cost_paise is our internal cost (costing).
-- ---------------------------------------------------------------------------
create table public.service_options (
  id uuid primary key default gen_random_uuid(),
  vertical text not null check (vertical in ('entertainment', 'extras')),
  category text not null,
  name text not null,
  description text,
  image_url text,
  unit text not null default 'each',
  rate_paise bigint check (rate_paise is null or rate_paise >= 0),
  cost_paise bigint check (cost_paise is null or cost_paise >= 0),
  guest_bookable boolean not null default false,   -- offered to wedding guests on their link
  active boolean not null default true,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vertical, name)
);
create trigger service_options_touch before update on public.service_options
  for each row execute function app.touch_updated_at();
alter table public.service_options enable row level security;
create policy service_options_read on public.service_options for select using (app.is_staff());
create policy service_options_write on public.service_options for all
  using (app.has_role('owner', 'event_manager')) with check (app.has_role('owner', 'event_manager'));
select app.enable_audit('public.service_options');

-- What was put in front of one couple, and what they chose. Name, description
-- and picture are copied when sent, so the couple never needs the catalogue.
create table public.wedding_selections (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid references public.event_functions(id) on delete set null,
  option_id uuid references public.service_options(id) on delete set null,
  vertical text not null check (vertical in ('entertainment', 'extras')),
  name text not null,
  description text,
  image_url text,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'chosen', 'declined', 'final')),
  staff_note text,
  client_note text,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id),
  chosen_at timestamptz,
  chosen_by uuid references public.profiles(id),
  finalised_at timestamptz,
  finalised_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wedding_selections_wedding_idx on public.wedding_selections(wedding_id, vertical);
create trigger wedding_selections_touch before update on public.wedding_selections
  for each row execute function app.touch_updated_at();
alter table public.wedding_selections enable row level security;
-- Staff see everything for weddings they can see; the family sees only what was sent to them.
create policy wedding_selections_read on public.wedding_selections for select
  using (app.staff_can_see_wedding(wedding_id) or (app.is_wedding_member(wedding_id) and status <> 'draft'));
create policy wedding_selections_write on public.wedding_selections for all
  using (app.staff_can_edit_wedding(wedding_id)) with check (app.staff_can_edit_wedding(wedding_id));
select app.enable_audit('public.wedding_selections');

-- The family chooses or declines an option that was sent to them. Nothing else.
create or replace function app.client_choose_selection(p_id uuid, p_choice text, p_note text default null) returns public.wedding_selections
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_s public.wedding_selections;
begin
  select * into v_s from public.wedding_selections where id = p_id for update;
  if v_s.id is null then raise exception 'Option not found'; end if;
  if not (app.is_service() or app.member_can(v_s.wedding_id, 'approve')) then
    raise exception 'Only the couple can choose options' using errcode = '42501';
  end if;
  if p_choice not in ('chosen', 'declined') then raise exception 'Choose or decline'; end if;
  if v_s.status not in ('sent', 'chosen', 'declined') then
    raise exception 'This option is already final. Please message your event manager to change it.';
  end if;
  update public.wedding_selections
     set status = p_choice, chosen_at = now(), chosen_by = auth.uid(), client_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id returning * into v_s;
  insert into public.notifications (user_id, role, title, body, link)
  select w.event_manager_id, case when w.event_manager_id is null then 'event_manager'::public.app_role end,
         format('%s %s %s', w.title, case when p_choice = 'chosen' then 'chose' else 'declined' end, v_s.name),
         v_s.client_note, '/team/weddings/' || w.id || '?tab=' || v_s.vertical
    from public.weddings w where w.id = v_s.wedding_id;
  return v_s;
end $$;
create or replace function public.client_choose_selection(p_id uuid, p_choice text, p_note text default null) returns public.wedding_selections
language sql set search_path = pg_catalog, public, app as $$ select * from app.client_choose_selection(p_id, p_choice, p_note) $$;
revoke execute on function public.client_choose_selection(uuid, text, text) from public, anon;
grant execute on function public.client_choose_selection(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Décor templates by area: a reference photo of the spot (main door, lobby,
-- staircase…) and photos of past work. Moodboards start from these.
-- ---------------------------------------------------------------------------
create table public.decor_templates (
  id uuid primary key default gen_random_uuid(),
  area text not null,                         -- 'Directional boards', 'Main door entry', 'Lobby', 'Staircase', 'Haldi stage'…
  title text not null,
  function_type text,                         -- optional: 'haldi', 'mehendi', 'wedding'…
  description text,
  reference_image_url text,                   -- the area as it is
  examples jsonb not null default '[]'::jsonb, -- [{url, caption}] past work
  palette text[] not null default '{}',
  design_kind public.design_kind not null default 'standard',
  active boolean not null default true,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger decor_templates_touch before update on public.decor_templates
  for each row execute function app.touch_updated_at();
alter table public.decor_templates enable row level security;
create policy decor_templates_read on public.decor_templates for select using (app.is_staff());
create policy decor_templates_write on public.decor_templates for all
  using (app.has_role('owner', 'event_manager')) with check (app.has_role('owner', 'event_manager'));
select app.enable_audit('public.decor_templates');

-- A moodboard made from a template remembers it.
alter table public.moodboards add column template_id uuid references public.decor_templates(id) on delete set null;

-- Photos for templates and options: public bucket (they're shown in moodboards
-- and on the guest page); only staff upload.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('library', 'library', true) on conflict (id) do nothing;
    execute $p$create policy library_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'library' and app.has_role('owner', 'event_manager'))$p$;
    execute $p$create policy library_update on storage.objects for update to authenticated
      using (bucket_id = 'library' and app.has_role('owner', 'event_manager'))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ideas wall: before planning opens the family can share ideas; we note them.
-- ---------------------------------------------------------------------------
create table public.wedding_ideas (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  author_id uuid references public.profiles(id) default auth.uid(),
  author_name text,
  body text not null check (length(trim(body)) between 1 and 2000),
  link_url text check (link_url is null or link_url ~* '^https?://'),
  vertical text check (vertical is null or vertical in ('decor', 'fnb', 'entertainment', 'extras', 'venue', 'other')),
  noted_at timestamptz,
  noted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index wedding_ideas_wedding_idx on public.wedding_ideas(wedding_id, created_at desc);
alter table public.wedding_ideas enable row level security;
create policy wedding_ideas_read on public.wedding_ideas for select using (app.can_see_wedding(wedding_id));
create policy wedding_ideas_add on public.wedding_ideas for insert
  with check ((app.is_wedding_member(wedding_id) and author_id = auth.uid()) or app.staff_can_see_wedding(wedding_id));
create policy wedding_ideas_note on public.wedding_ideas for update
  using (app.staff_can_see_wedding(wedding_id)) with check (app.staff_can_see_wedding(wedding_id));
select app.enable_audit('public.wedding_ideas');

-- ---------------------------------------------------------------------------
-- WhatsApp group: the invite link, once the event manager has made the group.
-- ---------------------------------------------------------------------------
alter table public.weddings add column whatsapp_group_url text
  check (whatsapp_group_url is null or whatsapp_group_url ~* '^https://chat\.whatsapp\.com/');

-- ---------------------------------------------------------------------------
-- Planning opens on each stage's date. With policy planning.start
-- allow_early_start = false, the family can't start a stage before its
-- recommended date; staff (the event manager or Prashanth) still can.
-- ---------------------------------------------------------------------------
create or replace function app.start_stage(p_stage_id uuid) returns public.wedding_stages
language plpgsql security definer set search_path = public, app as $$
declare
  v_stage public.wedding_stages;
  v_staff boolean;
begin
  select * into v_stage from public.wedding_stages where id = p_stage_id for update;
  if v_stage.id is null then
    raise exception 'Stage not found';
  end if;
  v_staff := app.is_service() or app.staff_can_edit_wedding(v_stage.wedding_id);
  if not (v_staff or app.member_can(v_stage.wedding_id, 'start_stages')) then
    raise exception 'You do not have permission to start this stage' using errcode = '42501';
  end if;

  if v_stage.started_at is not null then
    return v_stage; -- idempotent
  end if;

  if not app.stage_unlock_met(v_stage.wedding_id, v_stage.unlock_rule) then
    raise exception 'This stage unlocks after: %', replace(v_stage.unlock_rule, '_', ' ')
      using errcode = 'P0001', hint = 'stage_locked';
  end if;

  if not v_staff
     and coalesce((app.policy_value('planning.start') ->> 'allow_early_start')::boolean, true) = false
     and v_stage.recommended_start is not null and v_stage.recommended_start > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'This opens on %. Until then, share your ideas with us and we''ll note them.', to_char(v_stage.recommended_start, 'FMDD Mon YYYY')
      using errcode = 'P0001', hint = 'not_yet_open';
  end if;

  update public.wedding_stages
     set started_at = now(), started_by = auth.uid(), status = 'in_progress',
         snoozed_until = null, snooze_reason = null
   where id = p_stage_id
   returning * into v_stage;

  insert into public.agent_tasks (from_agent, kind, payload, wedding_id)
  values (null, 'stage_started',
          jsonb_build_object('stage_key', v_stage.key, 'stage_id', v_stage.id, 'started_by', auth.uid()),
          v_stage.wedding_id);

  perform app.refresh_stage_locks(v_stage.wedding_id);
  return v_stage;
end $$;

-- ---------------------------------------------------------------------------
-- The meeting's decisions, as policy edits (versioned with a change note).
-- Fresh databases get the same values from the seed.
-- ---------------------------------------------------------------------------
do $m$
begin
  perform set_config('app.change_note', 'Workflow meeting 2026-10-12: active planning opens 90 days before; entertainment and extras are their own stages.', true);

  update public.policies
     set rule_text = 'Active planning opens 90 days before the event. Until then the couple can share ideas, which we note; no stage starts before its opening date or its payment unlock.',
         value = jsonb_set(value, '{allow_early_start}', 'false'::jsonb)
   where key = 'planning.start' and (value ->> 'allow_early_start')::boolean is distinct from false;

  update public.policies
     set rule_text = 'Each planning stage opens on its date (active planning starts 90 days before the event) and never before its payment unlock. Until then the couple can share ideas. If a stage hasn''t started by its date, the portal nudges once, then the event manager calls.',
         value = jsonb_set(value, '{cards}', (
           select jsonb_agg(c order by ord) from (
             select c, ord from jsonb_array_elements(value -> 'cards') with ordinality as t(c, ord)
             union all
             select x.c, x.ord from (values
               (jsonb_build_object('key', 'entertainment', 'name', 'Entertainment', 'unlock', 'contract_paid', 'recommended_days_before', 90, 'recommended_label', '90 days before', 'triggers', 'Event manager sends artist and act options', 'needs_from_client', 'Pick your music, artists and acts'), 4.5),
               (jsonb_build_object('key', 'extras', 'name', 'Extras', 'unlock', 'contract_paid', 'recommended_days_before', 90, 'recommended_label', '90 days before', 'triggers', 'Event manager sends add-on options', 'needs_from_client', 'Choose any extras: makeup, laundry, welcome drinks and more'), 4.6)
             ) as x(c, ord)
             where not exists (select 1 from jsonb_array_elements(value -> 'cards') e where e ->> 'key' = x.c ->> 'key')
           ) s
         ))
   where key = 'portal.stage_cards';
end $m$;

-- Existing weddings get the two new stage cards.
do $$
declare v_id uuid;
begin
  for v_id in select id from public.weddings loop
    perform app.create_stage_cards(v_id);
  end loop;
end $$;
