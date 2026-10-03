-- Phase 2–4 rules enforced by the database itself (not just the UI or agents).
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------------
-- Phase 2: exactly one follow-up call per visit; no double-booked executive.
-- ---------------------------------------------------------------------------
do $$
declare v_visit uuid; v_lead uuid; v_ok boolean;
begin
  select v.id, v.lead_id into v_visit, v_lead from public.visits v where v.status = 'completed' limit 1;
  assert v_visit is not null, 'seed has a completed visit';
  insert into public.calls (lead_id, visit_id, direction, purpose, handled_by) values (v_lead, v_visit, 'outbound', 'follow_up', 'agent');
  begin
    insert into public.calls (lead_id, visit_id, direction, purpose, handled_by) values (v_lead, v_visit, 'outbound', 'follow_up', 'agent');
    v_ok := true;
  exception when unique_violation then v_ok := false;
  end;
  assert not v_ok, 'a second follow-up call for the same visit must be refused';
  delete from public.calls where visit_id = v_visit;
end $$;

do $$
declare v_lead uuid; v_exec uuid := '22222222-2222-4222-8222-222222222222'; v_ok boolean; v_end timestamptz;
begin
  select id into v_lead from public.leads limit 1;
  insert into public.visits (lead_id, scheduled_at, executive_id, duration_minutes) values (v_lead, '2030-01-05 05:30:00+00', v_exec, 90)
    returning slot_end into v_end;
  assert v_end = '2030-01-05 07:00:00+00', 'slot_end follows duration';
  begin
    insert into public.visits (lead_id, scheduled_at, executive_id) values (v_lead, '2030-01-05 06:00:00+00', v_exec);
    v_ok := true;
  exception when exclusion_violation then v_ok := false;
  end;
  assert not v_ok, 'an executive cannot host two overlapping visits';
  -- back-to-back is fine
  insert into public.visits (lead_id, scheduled_at, executive_id) values (v_lead, '2030-01-05 07:00:00+00', v_exec);
  delete from public.visits where scheduled_at >= '2030-01-01';
end $$;

-- A client can't read the outbox, inbound webhooks or chat sessions.
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.outbox) = 0, 'client sees no outbox';
  assert (select count(*) from public.inbound_events) = 0, 'client sees no inbound events';
  assert (select count(*) from public.chat_sessions) = 0, 'client sees no chat sessions';
  assert (select count(*) from public.external_reviews) = 0, 'client sees no review queue';
end $$;
rollback;
