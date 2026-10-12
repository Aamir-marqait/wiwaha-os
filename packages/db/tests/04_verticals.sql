-- Entertainment and extras selections, the ideas wall, planning opening dates (D35).
\set ON_ERROR_STOP 1

-- Staff send two options (one still a draft) to the demo couple.
do $$
declare v_w uuid := 'c0000000-0000-4000-8000-000000000001'; v_opt uuid;
begin
  insert into public.service_options (vertical, category, name, rate_paise, cost_paise) values ('entertainment', 'dj', 'Test DJ', 5000000, 3000000) returning id into v_opt;
  insert into public.wedding_selections (id, wedding_id, option_id, vertical, name, status, sent_at)
  values ('d1000000-0000-4000-8000-000000000001', v_w, v_opt, 'entertainment', 'Test DJ', 'sent', now()),
         ('d1000000-0000-4000-8000-000000000002', v_w, v_opt, 'entertainment', 'Draft act', 'draft', null);
end $$;

-- The couple sees what was sent (not drafts, not the catalogue or its prices) and can choose it.
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_ok boolean;
begin
  assert (select count(*) from public.wedding_selections) = 1, 'the couple sees only sent options';
  assert (select count(*) from public.service_options) = 0, 'the couple cannot read the catalogue (internal rates and costs)';
  perform public.client_choose_selection('d1000000-0000-4000-8000-000000000001', 'chosen', 'Love this');
  assert (select status from public.wedding_selections where id = 'd1000000-0000-4000-8000-000000000001') = 'chosen', 'chosen';
  begin
    update public.wedding_selections set status = 'final' where id = 'd1000000-0000-4000-8000-000000000001';
    v_ok := found;
  exception when insufficient_privilege then v_ok := false;
  end;
  assert not v_ok, 'the couple cannot make an option final themselves';
  begin
    perform public.client_choose_selection('d1000000-0000-4000-8000-000000000002', 'chosen');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  assert not v_ok, 'a draft the couple cannot see cannot be chosen';

  -- Ideas: the couple can share one.
  insert into public.wedding_ideas (wedding_id, author_id, body) values ('c0000000-0000-4000-8000-000000000001', '66666666-6666-4666-8666-666666666666', 'Marigolds everywhere');
end $$;
rollback;

-- Final options can't be changed by the couple.
do $$
begin
  update public.wedding_selections set status = 'final' where id = 'd1000000-0000-4000-8000-000000000001';
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_ok boolean;
begin
  begin
    perform public.client_choose_selection('d1000000-0000-4000-8000-000000000001', 'declined');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  assert not v_ok, 'a final option is fixed';
end $$;
rollback;

-- Planning opens on its date: the couple can't start a stage early; their event manager can.
do $$
declare v_stage uuid;
begin
  assert (select (value ->> 'allow_early_start')::boolean from public.policies where key = 'planning.start') = false, 'hard start by default';
  update public.payments set status = 'paid' where wedding_id = 'c0000000-0000-4000-8000-000000000001' and effect in ('holds_date', 'signs_contract', 'books');
  update public.wedding_stages set started_at = null, status = 'not_started', recommended_start = current_date + 30
   where wedding_id = 'c0000000-0000-4000-8000-000000000001' and key = 'extras' returning id into v_stage;
  perform set_config('test.stage', v_stage::text, false);
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_ok boolean;
begin
  begin
    perform app.start_stage(current_setting('test.stage')::uuid);
    v_ok := true;
  exception when others then v_ok := sqlerrm not like 'This opens on%';
  end;
  assert not v_ok, 'the couple cannot start a stage before it opens';
end $$;
rollback;
begin;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform app.start_stage(current_setting('test.stage')::uuid);
  assert (select started_at is not null from public.wedding_stages where id = current_setting('test.stage')::uuid), 'the event manager can open it early';
end $$;
rollback;

delete from public.wedding_selections where wedding_id = 'c0000000-0000-4000-8000-000000000001';
delete from public.service_options where name = 'Test DJ';
