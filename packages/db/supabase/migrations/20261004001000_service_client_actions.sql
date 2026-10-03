-- Server-side callers (approvals arriving by WhatsApp later, the e2e script)
-- may act for the couple or the décor lead, like app.start_stage allows.

create or replace function app.client_approve_menu(p_menu_id uuid, p_note text default null) returns public.menus
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.menus;
begin
  select * into v from public.menus where id = p_menu_id for update;
  if v.id is null then raise exception 'Menu not found'; end if;
  if not (app.is_service() or app.member_can(v.wedding_id, 'approve') or app.staff_can_edit_wedding(v.wedding_id)) then
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

create or replace function app.client_shortlist_moodboard(p_id uuid, p_shortlist boolean, p_feedback text default null) returns public.moodboards
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.moodboards;
begin
  select * into v from public.moodboards where id = p_id for update;
  if v.id is null then raise exception 'Moodboard not found'; end if;
  if not (app.is_service() or app.member_can(v.wedding_id, 'approve') or app.staff_can_edit_wedding(v.wedding_id)) then
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

create or replace function app.client_approve_quote(p_quote_id uuid) returns public.quotes
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.quotes;
begin
  select * into v from public.quotes where id = p_quote_id for update;
  if v.id is null then raise exception 'Quote not found'; end if;
  if not app.member_can(v.wedding_id, 'approve') and not app.is_owner() and not app.is_service() then
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

create or replace function app.finalise_moodboard(p_id uuid) returns public.moodboards
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v public.moodboards;
begin
  select * into v from public.moodboards where id = p_id for update;
  if v.id is null then raise exception 'Moodboard not found'; end if;
  if not (app.is_service() or app.staff_can_edit_wedding(v.wedding_id)) then raise exception 'Only the wedding''s team can finalise décor' using errcode = '42501'; end if;
  if v.status not in ('shortlisted', 'generated') then raise exception 'Only a shortlisted moodboard can be finalised'; end if;
  update public.moodboards set status = 'finalised' where id = p_id returning * into v;
  insert into public.agent_tasks (kind, wedding_id, payload) values ('moodboard_finalised', v.wedding_id, jsonb_build_object('moodboard_id', v.id));
  return v;
end $$;

