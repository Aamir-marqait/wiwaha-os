-- Server-side callers (agents, webhooks, the e2e script) may submit a brief or
-- rooming list on the family's behalf, like app.start_stage allows.

create or replace function app.submit_brief(p_wedding uuid, p_answers jsonb) returns public.wedding_briefs
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.wedding_briefs;
begin
  if not (app.is_service() or app.member_can(p_wedding, 'edit_brief') or app.staff_can_edit_wedding(p_wedding)) then
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

create or replace function app.submit_rooming_list(p_wedding uuid) returns integer
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_count integer;
begin
  if not (app.is_service() or app.member_can(p_wedding, 'edit_brief') or app.staff_can_edit_wedding(p_wedding)) then
    raise exception 'You do not have permission to submit the rooming list' using errcode = '42501';
  end if;
  select count(*) into v_count from public.room_allocations where wedding_id = p_wedding and status <> 'cancelled';
  if v_count = 0 then raise exception 'Add at least one guest before submitting'; end if;
  insert into public.agent_tasks (kind, wedding_id, payload) values ('rooming_list_submitted', p_wedding, jsonb_build_object('guests', v_count));
  return v_count;
end $$;

