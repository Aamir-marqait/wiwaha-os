-- Phase 3 portal flows: brief submission, portal chat, rooming list, and the
-- décor lead's "finalise". Each emits an agent_task for the Chief of Staff
-- to route; clients never write agent_tasks directly.

-- ---------------------------------------------------------------------------
-- Couples only see messages that have actually been sent (or that they sent).
-- ---------------------------------------------------------------------------
drop policy if exists messages_staff_read on public.messages;
create policy messages_staff_read on public.messages for select
  using ((lead_id is not null and app.has_role('owner', 'sales', 'event_manager'))
      or (wedding_id is not null and app.staff_can_see_wedding(wedding_id))
      or (wedding_id is not null and client_visible and app.is_wedding_member(wedding_id)
          and status in ('approved', 'queued', 'sent', 'delivered', 'read', 'received')));

-- A couple's portal chat message goes to the Wedding Room agent.
create or replace function app.on_client_message() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
begin
  if new.wedding_id is not null and new.direction = 'inbound' and new.author_kind = 'client' and new.channel = 'portal' then
    insert into public.agent_tasks (kind, wedding_id, payload)
    values ('family_message', new.wedding_id, jsonb_build_object('message_id', new.id));
  end if;
  return new;
end $$;
create trigger messages_client_to_wedding_room after insert on public.messages
  for each row execute function app.on_client_message();

-- ---------------------------------------------------------------------------
-- Brief: save answers (and functions, via the table) then submit.
-- ---------------------------------------------------------------------------
create or replace function app.submit_brief(p_wedding uuid, p_answers jsonb) returns public.wedding_briefs
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.wedding_briefs;
begin
  if not (app.member_can(p_wedding, 'edit_brief') or app.staff_can_edit_wedding(p_wedding)) then
    raise exception 'You do not have permission to edit the brief' using errcode = '42501';
  end if;
  perform app.require_stage_open(p_wedding, 'brief');
  insert into public.wedding_briefs (wedding_id, answers, status, submitted_by, submitted_at)
  values (p_wedding, coalesce(p_answers, '{}'::jsonb), 'submitted', auth.uid(), now())
  on conflict (wedding_id) do update
     set answers = excluded.answers, status = 'submitted', submitted_by = auth.uid(), submitted_at = now()
  returning * into v;
  update public.wedding_stages set status = 'in_progress' where wedding_id = p_wedding and key = 'brief' and status in ('not_started', 'awaiting_client');
  insert into public.agent_tasks (kind, wedding_id, payload) values ('brief_submitted', p_wedding, '{}'::jsonb);
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Rooming list: the couple says it's ready for the Rooms & Guests agent.
-- ---------------------------------------------------------------------------
create or replace function app.submit_rooming_list(p_wedding uuid) returns integer
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_count integer;
begin
  if not (app.member_can(p_wedding, 'edit_brief') or app.staff_can_edit_wedding(p_wedding)) then
    raise exception 'You do not have permission to submit the rooming list' using errcode = '42501';
  end if;
  select count(*) into v_count from public.room_allocations where wedding_id = p_wedding and status <> 'cancelled';
  if v_count = 0 then raise exception 'Add at least one guest before submitting'; end if;
  insert into public.agent_tasks (kind, wedding_id, payload) values ('rooming_list_submitted', p_wedding, jsonb_build_object('guests', v_count));
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Décor lead finalises a shortlisted board (custom work then goes to Prashanth).
-- ---------------------------------------------------------------------------
create or replace function app.finalise_moodboard(p_id uuid) returns public.moodboards
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.moodboards;
begin
  select * into v from public.moodboards where id = p_id for update;
  if v.id is null then raise exception 'Moodboard not found'; end if;
  if not app.staff_can_edit_wedding(v.wedding_id) then raise exception 'Only the wedding''s team can finalise décor' using errcode = '42501'; end if;
  if v.status not in ('shortlisted', 'generated') then raise exception 'Only a shortlisted moodboard can be finalised'; end if;
  update public.moodboards set status = 'finalised' where id = p_id returning * into v;
  insert into public.agent_tasks (kind, wedding_id, payload) values ('moodboard_finalised', v.wedding_id, jsonb_build_object('moodboard_id', v.id));
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Public wrappers.
-- ---------------------------------------------------------------------------
create or replace function public.submit_brief(p_wedding uuid, p_answers jsonb) returns public.wedding_briefs
language sql set search_path = pg_catalog, public, app as $$ select * from app.submit_brief(p_wedding, p_answers) $$;
create or replace function public.submit_rooming_list(p_wedding uuid) returns integer
language sql set search_path = pg_catalog, public, app as $$ select app.submit_rooming_list(p_wedding) $$;
create or replace function public.finalise_moodboard(p_id uuid) returns public.moodboards
language sql set search_path = pg_catalog, public, app as $$ select * from app.finalise_moodboard(p_id) $$;
revoke execute on function public.submit_brief(uuid, jsonb) from public, anon;
revoke execute on function public.submit_rooming_list(uuid) from public, anon;
revoke execute on function public.finalise_moodboard(uuid) from public, anon;
grant execute on function public.submit_brief(uuid, jsonb) to authenticated, service_role;
grant execute on function public.submit_rooming_list(uuid) to authenticated, service_role;
grant execute on function public.finalise_moodboard(uuid) to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
