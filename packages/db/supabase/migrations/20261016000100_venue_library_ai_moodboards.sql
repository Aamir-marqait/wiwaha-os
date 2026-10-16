-- =============================================================================
-- Wiwaha OS · Venue areas, the media library, the décor questionnaire and
-- AI moodboards made from plain photos of each area (D39, D40)
--
-- Every area of the estate is photographed as it is (no décor), from several
-- angles. When the décor stage opens the couple fills in the décor
-- questionnaire; the Design assistant then makes one moodboard per function:
-- each area the function uses, shown as it is next to an AI-dressed version.
-- The team reviews a board before the couple sees it (the Design assistant's
-- autonomy dial decides), and the couple can ask for changes slide by slide.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Venue areas: the physical spaces décor is planned for.
-- ---------------------------------------------------------------------------
create type public.venue_area_kind as enum ('entrance', 'pathway', 'lawn', 'hall', 'poolside', 'amphitheatre', 'courtyard', 'rooms', 'other');

create table public.venue_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 2 and 80),
  kind public.venue_area_kind not null default 'other',
  description text,                                   -- what the space is like, read by the Design assistant
  space_id uuid references public.spaces(id) on delete set null,   -- the bookable space it belongs to, if any
  suits public.function_type[] not null default '{}', -- functions this area usually hosts
  sort integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger venue_areas_touch before update on public.venue_areas
  for each row execute function app.touch_updated_at();
alter table public.venue_areas enable row level security;
-- Families pick areas in the décor questionnaire, so anyone signed in can read them.
create policy venue_areas_read on public.venue_areas for select using (auth.uid() is not null);
create policy venue_areas_write on public.venue_areas for all
  using (app.has_role('owner', 'event_manager', 'staff')) with check (app.has_role('owner', 'event_manager', 'staff'));
select app.enable_audit('public.venue_areas');

-- The estate's real spaces, as they appear in the team's own moodboards.
insert into public.venue_areas (name, kind, description, suits, sort) values
  ('Main entrance', 'entrance', 'The carved teak doorway set in a deep white portico, dark stone walls either side, three wide steps up.', '{wedding,reception,pooja,engagement}', 10),
  ('Lobby pathway', 'pathway', 'A long covered walkway of grey stone from the main door, white pillars and a dark slatted ceiling, planters along one side.', '{wedding,reception,sangeet,engagement}', 20),
  ('Lawn entrance', 'entrance', 'Floating stone steps and a landing that open from the lobby onto the lawn, beside a still water channel.', '{wedding,reception,engagement}', 30),
  ('Lawn', 'lawn', 'The open lawn ringed by tall trees, facing the white guest-room block; room for a mandap or stage and round tables.', '{wedding,reception,engagement,cocktail}', 40),
  ('Indoor hall', 'hall', 'A pillared hall under a high steel-trussed roof with a patterned stone floor, open at the sides to the garden.', '{pooja,wedding,reception,sangeet,haldi}', 50),
  ('Pool deck', 'poolside', 'A covered stone deck beside the pool under a trussed roof, a dark stone wall at the far end, rattan furniture.', '{mehendi,haldi,cocktail}', 60),
  ('Amphitheatre', 'amphitheatre', 'Stepped stone seating facing a paved stage court beside the main building; best in the evening.', '{sangeet,cocktail,reception}', 70),
  ('Courtyard', 'courtyard', 'The paved courtyard and tree-lined steps in front of the guest-room block.', '{haldi,mehendi,cocktail}', 80)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- The media library: the estate's own photos and clips. Used for the décor
-- base photos (look = 'plain') and by the content studio for posts and reels.
-- Folders nest up to four deep; deleting one moves its files up a level.
-- ---------------------------------------------------------------------------
create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  parent_id uuid references public.media_folders(id) on delete restrict,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  unique (parent_id, name)
);
create or replace function app.guard_media_folder() returns trigger
language plpgsql set search_path = pg_catalog, public, app as $$
declare v_depth integer := 1; v_parent uuid := new.parent_id;
begin
  while v_parent is not null loop
    if v_parent = new.id then raise exception 'A folder cannot sit inside itself'; end if;
    v_depth := v_depth + 1;
    if v_depth > 4 then raise exception 'Folders nest at most four deep'; end if;
    select parent_id into v_parent from public.media_folders where id = v_parent;
  end loop;
  return new;
end $$;
create trigger media_folders_guard before insert or update on public.media_folders
  for each row execute function app.guard_media_folder();
alter table public.media_folders enable row level security;
create policy media_folders_read on public.media_folders for select using (app.is_staff());
create policy media_folders_write on public.media_folders for all
  using (app.has_role('owner', 'sales', 'event_manager', 'staff')) with check (app.has_role('owner', 'sales', 'event_manager', 'staff'));
select app.enable_audit('public.media_folders');

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'video')),
  path text not null unique,                 -- object path in the public 'media' bucket
  url text not null,                         -- its public link
  thumb_url text,                            -- a still for videos
  content_type text,
  bytes bigint check (bytes is null or bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  title text,
  description text,                          -- what's in the frame; the studio picks shots by it
  tags text[] not null default '{}',
  folder_id uuid references public.media_folders(id) on delete set null,
  venue_area_id uuid references public.venue_areas(id) on delete set null,
  look text not null default 'other' check (look in ('plain', 'decorated', 'event', 'detail', 'people', 'aerial', 'other')),
  angle text,                                -- 'From the steps', 'Wide, evening'…
  is_primary boolean not null default false, -- the area's main base photo
  status text not null default 'ready' check (status in ('pending', 'ready', 'failed')),
  status_error text,
  described_by text check (described_by in ('ai', 'staff')),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_primary or (venue_area_id is not null and kind = 'image'))
);
create index media_assets_area_idx on public.media_assets(venue_area_id, look);
create index media_assets_folder_idx on public.media_assets(folder_id);
create unique index media_assets_one_primary on public.media_assets(venue_area_id) where is_primary;
create trigger media_assets_touch before update on public.media_assets
  for each row execute function app.touch_updated_at();
alter table public.media_assets enable row level security;
-- Staff see the whole library; families see the plain photos of each area (questionnaire).
create policy media_assets_read on public.media_assets for select
  using (app.is_staff() or (look = 'plain' and venue_area_id is not null and auth.uid() is not null));
create policy media_assets_write on public.media_assets for all
  using (app.has_role('owner', 'sales', 'event_manager', 'staff')) with check (app.has_role('owner', 'sales', 'event_manager', 'staff'));
select app.enable_audit('public.media_assets');

-- Removing a folder never removes a photo: its files and sub-folders move up.
create or replace function app.delete_media_folder(p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_parent uuid;
begin
  if not (app.is_service() or app.has_role('owner', 'sales', 'event_manager', 'staff')) then
    raise exception 'You do not have permission to change the library' using errcode = '42501';
  end if;
  select parent_id into v_parent from public.media_folders where id = p_id;
  if not found then raise exception 'Folder not found'; end if;
  update public.media_assets set folder_id = v_parent where folder_id = p_id;
  update public.media_folders set parent_id = v_parent where parent_id = p_id;
  delete from public.media_folders where id = p_id;
end $$;
create or replace function public.delete_media_folder(p_id uuid) returns void
language sql set search_path = pg_catalog, public, app as $$ select app.delete_media_folder(p_id) $$;
revoke execute on function public.delete_media_folder(uuid) from public, anon;
grant execute on function public.delete_media_folder(uuid) to authenticated, service_role;

-- One primary base photo per area; choosing a new one clears the old.
create or replace function app.set_primary_media(p_asset uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.media_assets;
begin
  if not (app.is_service() or app.has_role('owner', 'event_manager', 'staff')) then
    raise exception 'You do not have permission to change the library' using errcode = '42501';
  end if;
  select * into v from public.media_assets where id = p_asset;
  if v.id is null or v.venue_area_id is null then raise exception 'Choose a photo that belongs to an area'; end if;
  update public.media_assets set is_primary = false where venue_area_id = v.venue_area_id and is_primary and id <> p_asset;
  update public.media_assets set is_primary = true where id = p_asset;
end $$;
create or replace function public.set_primary_media(p_asset uuid) returns void
language sql set search_path = pg_catalog, public, app as $$ select app.set_primary_media(p_asset) $$;
revoke execute on function public.set_primary_media(uuid) from public, anon;
grant execute on function public.set_primary_media(uuid) to authenticated, service_role;

-- Public bucket: fal fetches these by URL, and the paths are unguessable.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
    execute $p$create policy media_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and app.has_role('owner', 'sales', 'event_manager', 'staff'))$p$;
    execute $p$create policy media_update on storage.objects for update to authenticated
      using (bucket_id = 'media' and app.has_role('owner', 'sales', 'event_manager', 'staff'))$p$;
    execute $p$create policy media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'media' and app.has_role('owner', 'sales', 'event_manager'))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The décor questionnaire: one per wedding, filled in by the couple once the
-- décor stage is open. Submitting it asks the Design assistant for moodboards.
-- ---------------------------------------------------------------------------
create table public.decor_briefs (
  wedding_id uuid primary key references public.weddings(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'submitted', 'generating', 'ready')),
  answers jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger decor_briefs_touch before update on public.decor_briefs
  for each row execute function app.touch_updated_at();
alter table public.decor_briefs enable row level security;
create policy decor_briefs_read on public.decor_briefs for select using (app.can_see_wedding(wedding_id));
create policy decor_briefs_staff_write on public.decor_briefs for all
  using (app.staff_can_edit_wedding(wedding_id)) with check (app.staff_can_edit_wedding(wedding_id));
select app.enable_audit('public.decor_briefs');

-- Save (and optionally submit) the questionnaire. The décor stage must be open:
-- décor never starts before its opening date or its payment unlock.
create or replace function app.save_decor_brief(p_wedding uuid, p_answers jsonb, p_submit boolean default false) returns public.decor_briefs
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.decor_briefs; v_staff boolean := app.is_service() or app.staff_can_edit_wedding(p_wedding);
begin
  if not (v_staff or app.member_can(p_wedding, 'edit_brief')) then
    raise exception 'You do not have permission to fill in the décor questionnaire' using errcode = '42501';
  end if;
  perform app.require_stage_open(p_wedding, 'decor');
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Answers must be an object'; end if;
  select * into v from public.decor_briefs where wedding_id = p_wedding for update;
  if v.wedding_id is not null and v.status <> 'open' and not v_staff then
    raise exception 'Your décor questionnaire is already with our team. Message us if you would like to change an answer.';
  end if;
  insert into public.decor_briefs (wedding_id, answers, status, submitted_at, submitted_by)
  values (p_wedding, coalesce(p_answers, '{}'::jsonb),
          case when p_submit then 'submitted' else 'open' end,
          case when p_submit then now() end, case when p_submit then auth.uid() end)
  on conflict (wedding_id) do update
     set answers = excluded.answers,
         status = case when p_submit then 'submitted' else decor_briefs.status end,
         submitted_at = case when p_submit then now() else decor_briefs.submitted_at end,
         submitted_by = case when p_submit then auth.uid() else decor_briefs.submitted_by end
  returning * into v;
  if p_submit then
    update public.wedding_stages set status = 'in_progress' where wedding_id = p_wedding and key = 'decor' and status in ('not_started', 'awaiting_client');
    insert into public.agent_tasks (kind, wedding_id, payload) values ('decor_brief_submitted', p_wedding, '{}'::jsonb);
  end if;
  return v;
end $$;
create or replace function public.save_decor_brief(p_wedding uuid, p_answers jsonb, p_submit boolean default false) returns public.decor_briefs
language sql set search_path = pg_catalog, public, app as $$ select * from app.save_decor_brief(p_wedding, p_answers, p_submit) $$;
revoke execute on function public.save_decor_brief(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_decor_brief(uuid, jsonb, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Moodboards: where a board came from, when the couple could first see it,
-- and an edited deck the team may upload in its place.
-- ---------------------------------------------------------------------------
alter table public.moodboards
  add column source text not null default 'template' check (source in ('template', 'theme', 'ai')),
  add column shared_at timestamptz default now(),
  add column deck_url text;
comment on column public.moodboards.shared_at is 'When the couple could first see the board. AI boards stay unshared until the team (or the autonomy dial) shares them.';

drop policy moodboards_read on public.moodboards;
create policy moodboards_read on public.moodboards for select
  using (app.staff_can_see_wedding(wedding_id) or (app.is_wedding_member(wedding_id) and shared_at is not null));

-- An unshared board can't be shortlisted by the family.
create or replace function app.client_shortlist_moodboard(p_id uuid, p_shortlist boolean, p_feedback text default null) returns public.moodboards
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.moodboards; v_staff boolean;
begin
  select * into v from public.moodboards where id = p_id for update;
  if v.id is null then raise exception 'Moodboard not found'; end if;
  v_staff := app.is_service() or app.staff_can_edit_wedding(v.wedding_id);
  if not (v_staff or app.member_can(v.wedding_id, 'approve')) then
    raise exception 'You do not have permission to shortlist moodboards' using errcode = '42501';
  end if;
  if v.shared_at is null and not v_staff then raise exception 'Moodboard not found'; end if;
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
-- Moodboard slides: one area of one function, as it is and as dressed.
-- ---------------------------------------------------------------------------
create table public.moodboard_slides (
  id uuid primary key default gen_random_uuid(),
  moodboard_id uuid not null references public.moodboards(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid references public.event_functions(id) on delete cascade,
  venue_area_id uuid references public.venue_areas(id) on delete set null,
  area_name text not null,
  base_asset_id uuid references public.media_assets(id) on delete set null,
  base_url text,                       -- the area as it is (our own plain photo)
  element text not null,               -- 'Mandap', 'Entrance door décor', 'Guest seating'…
  caption text,                        -- one line under the picture
  prompt text,                         -- what the image model was asked to do
  reference_urls text[] not null default '{}',   -- our area-wise template photos, used as style references
  engine text not null default 'ai' check (engine in ('ai', 'reference')),       -- 'reference' = a template photo, no AI
  status text not null default 'queued' check (status in ('queued', 'rendering', 'ready', 'failed')),
  result_url text,                     -- the dressed version
  edited_url text,                     -- an edited image the team uploaded in its place
  edited_by uuid references public.profiles(id),
  client_note text,                    -- the couple's change request
  redo_count integer not null default 0,
  error text,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index moodboard_slides_board_idx on public.moodboard_slides(moodboard_id, sort);
create index moodboard_slides_status_idx on public.moodboard_slides(status) where status in ('queued', 'rendering');
create trigger moodboard_slides_touch before update on public.moodboard_slides
  for each row execute function app.touch_updated_at();
alter table public.moodboard_slides enable row level security;
create policy moodboard_slides_read on public.moodboard_slides for select
  using (app.staff_can_see_wedding(wedding_id)
      or (app.is_wedding_member(wedding_id) and exists (
            select 1 from public.moodboards m where m.id = moodboard_id and m.shared_at is not null)));
create policy moodboard_slides_write on public.moodboard_slides for all
  using (app.staff_can_edit_wedding(wedding_id)) with check (app.staff_can_edit_wedding(wedding_id));
select app.enable_audit('public.moodboard_slides');

-- The couple asks for a change to one slide; the Design assistant redoes it.
create or replace function app.client_note_moodboard_slide(p_id uuid, p_note text) returns public.moodboard_slides
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.moodboard_slides; v_shared timestamptz;
begin
  select * into v from public.moodboard_slides where id = p_id for update;
  if v.id is null then raise exception 'Slide not found'; end if;
  select shared_at into v_shared from public.moodboards where id = v.moodboard_id;
  if not (app.is_service() or app.staff_can_edit_wedding(v.wedding_id) or (v_shared is not null and app.member_can(v.wedding_id, 'approve'))) then
    raise exception 'You do not have permission to comment on this moodboard' using errcode = '42501';
  end if;
  perform app.require_stage_open(v.wedding_id, 'decor');
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Tell us what you would like changed'; end if;
  update public.moodboard_slides set client_note = left(btrim(p_note), 600) where id = p_id returning * into v;
  insert into public.agent_tasks (kind, wedding_id, payload) values ('moodboard_feedback', v.wedding_id, jsonb_build_object('slide_id', v.id, 'moodboard_id', v.moodboard_id));
  return v;
end $$;
create or replace function public.client_note_moodboard_slide(p_id uuid, p_note text) returns public.moodboard_slides
language sql set search_path = pg_catalog, public, app as $$ select * from app.client_note_moodboard_slide(p_id, p_note) $$;
revoke execute on function public.client_note_moodboard_slide(uuid, text) from public, anon;
grant execute on function public.client_note_moodboard_slide(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Media jobs: every call to fal (images, voice, music, clips) and every local
-- render step, so webhooks and the 15-minute sweep can finish what was started.
-- ---------------------------------------------------------------------------
create table public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,                     -- 'moodboard_slide', 'studio_slide', 'studio_shot', 'studio_voice'…
  subject_table text not null,
  subject_id uuid not null,
  endpoint text,                             -- the fal endpoint, null for local steps
  request_id text unique,
  status_url text,
  response_url text,
  status text not null default 'queued' check (status in ('queued', 'submitted', 'done', 'failed', 'cancelled')),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempts integer not null default 0,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_jobs_open_idx on public.media_jobs(status, created_at) where status in ('queued', 'submitted');
create index media_jobs_subject_idx on public.media_jobs(subject_table, subject_id);
create trigger media_jobs_touch before update on public.media_jobs
  for each row execute function app.touch_updated_at();
alter table public.media_jobs enable row level security;
create policy media_jobs_read on public.media_jobs for select using (app.is_owner());

-- ---------------------------------------------------------------------------
-- Policy: how AI moodboards are made. Prashanth can change any of it.
-- ---------------------------------------------------------------------------
do $m$
begin
  perform set_config('app.change_note', 'AI moodboards from plain area photos and the couple''s décor questionnaire (D40)', true);
  insert into public.policies (key, topic, title, rule_text, value, client_visible, needs_confirmation, sort)
  values ('decor.ai_moodboards', 'Planning', 'AI moodboards',
          'When the décor stage opens, the couple fills in a short décor questionnaire. For each function we then make one moodboard: every area the function uses is shown as it is, from our own plain photo, next to a dressed version made with AI, at most five areas per function. AI pictures are a guide to the mood, not a promise of exact pieces. The couple can ask for changes to any slide, up to three times each; the décor team can upload an edited version at any time.',
          '{"enabled":true,"areas_per_function_max":5,"redos_per_slide":3,"plain_photo_required":true,"label_ai_images":true}'::jsonb,
          true, false, 72)
  on conflict (key) do nothing;
end $m$;
