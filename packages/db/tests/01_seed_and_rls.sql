-- SQL tests run by scripts/test-migrations.sh against a throwaway database.
-- Each block impersonates a user the way PostgREST does (JWT claims + role).
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------------
-- Seed sanity
-- ---------------------------------------------------------------------------
do $$
begin
  assert (select count(*) from public.agents) = 21, 'expected 21 agents';
  assert (select count(*) from public.agents where enabled and implemented and autonomy = 'draft') = 21, 'all 21 agents built, switched on, in draft';
  assert (select count(*) from public.agents where autonomy <> 'draft') = 0, 'every agent ships in draft';
  assert (select count(*) from public.policies) = 37, 'policy book seeded (Phase 1–4 rules)';
  assert (select rule_text from public.policies where key = 'followup.after_visit')
         = 'Exactly one follow-up call, two days after a site visit. No response = stop calling.', 'follow-up wording';
  assert (select count(*) from public.rooms where active) = 30, '30 rooms today';
  assert (select count(*) from public.rooms) = 60, '60 rooms after expansion';
  assert (select count(*) from public.wedding_stages where wedding_id = 'c0000000-0000-4000-8000-000000000001') = 8, '8 stage cards';
  assert (select sum(amount_paise) from public.payments where wedding_id = 'c0000000-0000-4000-8000-000000000001') = 4500000 * 100, 'payments sum to contract';
  assert (select amount_paise from public.payments where wedding_id = 'c0000000-0000-4000-8000-000000000001' and milestone = 'deposit') = 450000 * 100, '10% deposit';
  assert (select due_on from public.payments where wedding_id = 'c0000000-0000-4000-8000-000000000001' and milestone = 'final') = current_date + 120 - 30, '50% due T-30';
  assert (select count(*) from public.profiles) = 8, 'demo profiles created by auth trigger';
  assert (select role from public.profiles where email = 'prashanth@wiwaha.example') = 'owner', 'owner role from app_metadata';
end $$;

-- Dedupe: Sneha wrote twice with differently formatted numbers → one lead, two touches.
do $$
declare v_leads int; v_touches int;
begin
  select count(*), max(touch_count) into v_leads, v_touches
    from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011106';
  assert v_leads = 1, 'Sneha should have one lead';
  assert v_touches = 2, 'Sneha should have two touches';
end $$;

-- Stage locks after seed: brief started, ceremonies unlocked, décor locked (40% unpaid).
do $$
begin
  assert (select status from public.wedding_stages where wedding_id = 'c0000000-0000-4000-8000-000000000001' and key = 'ceremonies') = 'not_started', 'ceremonies unlocked';
  assert (select status from public.wedding_stages where wedding_id = 'c0000000-0000-4000-8000-000000000001' and key = 'decor') = 'locked', 'décor locked before 40%';
end $$;

-- ---------------------------------------------------------------------------
-- Client (Ananya, couple)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.weddings) = 1, 'client sees only her wedding';
  assert (select count(*) from public.leads) = 0, 'client sees no leads';
  assert (select count(*) from public.contacts) = 0, 'client sees no contacts';
  assert (select count(*) from public.agent_actions) = 0, 'client sees no agent log';
  assert (select count(*) from public.audit_log) = 0, 'client sees no audit log';
  assert (select count(*) from public.approvals) = 0, 'client sees no approvals';
  assert (select count(*) from public.cost_entries) = 0, 'client sees no costs';
  assert (select count(*) from public.payments) = 3, 'couple can view payments';
  assert (select count(*) from public.policies where not client_visible) = 0, 'client sees only client-visible policies';
  assert (select count(*) from public.calendar_entries) = 0, 'client does not see the master calendar';
  assert (select count(*) from public.price_book_items) = 0, 'client does not see the price book';
end $$;
-- Décor cannot start before the 40% payment.
do $$
begin
  perform public.start_stage((select id from public.wedding_stages where key = 'decor'));
  raise exception 'décor should not start before the 40%% payment';
exception when others then
  if sqlerrm not like 'This stage unlocks after%' then raise; end if;
end $$;
-- Ceremonies can start early (brief already started).
do $$
begin
  perform public.start_stage((select id from public.wedding_stages where key = 'ceremonies'));
  assert (select status from public.wedding_stages where key = 'ceremonies') = 'in_progress', 'ceremonies started';
end $$;
-- A client can't make herself owner.
do $$
begin
  update public.profiles set role = 'owner' where id = auth.uid();
  raise exception 'role escalation should fail';
exception when others then
  if sqlerrm not like 'Only the owner can change roles%' then raise; end if;
end $$;
rollback;

-- Parent (Sunita): no payment visibility, can't start stages.
begin;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.payments) = 0, 'parent cannot see payments unless the couple allows';
  begin
    perform public.start_stage((select id from public.wedding_stages where key = 'ceremonies'));
    raise exception 'parent should not start stages';
  exception when others then
    if sqlerrm not like 'You do not have permission%' then raise; end if;
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Estate staff (Manju): only his task list
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.tasks) = (select count(*) from public.tasks where owner_id = auth.uid()), 'staff see only their own tasks';
  assert (select count(*) from public.tasks) = 2, 'Manju has two tasks';
  assert (select count(*) from public.leads) = 0, 'staff see no leads';
  assert (select count(*) from public.payments) = 0, 'staff see no payments';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Sales (Kavya): leads yes; audit, costs, agent dial no
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  assert (select count(*) from public.leads) >= 7, 'sales sees leads';
  assert (select count(*) from public.audit_log) = 0, 'only owner reads audit';
  assert (select count(*) from public.cost_entries) = 0, 'sales cannot see margins';
  update public.agents set autonomy = 'act_silently' where key = 'lead_desk';
  get diagnostics n = row_count;
  assert n = 0, 'only the owner can turn the autonomy dial';
  update public.policies set rule_text = 'hacked' where key = 'discounts';
  get diagnostics n = row_count;
  assert n = 0, 'only the owner can edit the policy book';
end $$;
-- Double booking is impossible: Rhea's hold blocks the Grand Lawn.
do $$
begin
  perform public.place_hold('space', (select id from public.spaces where name = 'The Grand Lawn'), current_date + 241, current_date + 241, null, 24, 'clash');
  raise exception 'expected a clash';
exception when others then
  if sqlerrm not like 'That date is already held%' then raise; end if;
end $$;
-- An enquiry pencil mark does not block a hold.
do $$
declare e public.calendar_entries;
begin
  e := public.place_hold('space', (select id from public.spaces where name = 'The Grand Lawn'), current_date + 200, current_date + 200, null, 24, 'test hold');
  assert e.status = 'held' and e.expires_at > now() + interval '23 hours', 'hold placed with expiry';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Hold expiry releases automatically
-- ---------------------------------------------------------------------------
begin;
update public.calendar_entries set expires_at = now() - interval '1 minute' where label = 'Rhea Kapoor (hold)';
do $$
declare n int;
begin
  n := app.release_expired_holds();
  assert n = 1, 'one hold released';
  assert (select status from public.calendar_entries where label = 'Rhea Kapoor (hold)') = 'released', 'Rhea hold released';
  assert (select count(*) from public.agent_tasks where kind = 'hold_released_notify_client') = 1, 'client notification queued for Chief of Staff';
  assert (select hold_expires_at from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011104') is null, 'lead hold cleared';
end $$;
rollback;

-- Expired-but-unreleased holds don't block new holds (place_hold releases first).
begin;
update public.calendar_entries set expires_at = now() - interval '1 minute' where label = 'Rhea Kapoor (hold)';
do $$
declare e public.calendar_entries;
begin
  e := app.place_hold('space', (select id from public.spaces where name = 'The Grand Lawn'), current_date + 240, current_date + 240, null, 72, 'new family');
  assert e.status = 'held', 'date freed by expiry';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Owner: policy edit is versioned and audited with IP
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1","user-agent":"test-agent","x-wiwaha-surface":"team"}', true);
set local role authenticated;
update public.policies set value = jsonb_set(value, '{hours}', '48'), rule_text = 'A date can be held for 48 hours without payment.' where key = 'holds.soft_hold';
do $$
begin
  assert (select version from public.policies where key = 'holds.soft_hold') = 2, 'policy version bumped';
  assert (select count(*) from public.policy_versions where policy_key = 'holds.soft_hold') = 2, 'version history kept';
  assert exists (select 1 from public.audit_log where table_name = 'policies' and record_id = 'holds.soft_hold'
                 and ip = '203.0.113.7' and user_id = '11111111-1111-4111-8111-111111111111'
                 and user_agent = 'test-agent' and via = 'team' and 'value' = any(changed_fields)), 'audit with user, IP, fields';
end $$;
-- New hold length applies immediately.
do $$
declare e public.calendar_entries;
begin
  e := public.place_hold('room', (select id from public.rooms where number = '101'), current_date + 10, current_date + 11);
  assert e.expires_at between now() + interval '47 hours' and now() + interval '49 hours', 'hold uses edited policy (48h)';
end $$;
-- Owner can turn the dial.
update public.agents set autonomy = 'act_and_notify' where key = 'lead_desk';
do $$ begin assert (select autonomy from public.agents where key = 'lead_desk') = 'act_and_notify', 'owner turned the dial'; end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Approvals: who decides what
-- ---------------------------------------------------------------------------
begin;
insert into public.approvals (id, kind, title, payload) values
  ('d0000000-0000-4000-8000-000000000001', 'discount', 'Discount request', '{}'),
  ('d0000000-0000-4000-8000-000000000002', 'lead_reply', 'Reply to Meera', '{"body":"Hello"}');
insert into public.messages (lead_id, channel, direction, status, author_kind, agent_key, approval_id, body)
select l.id, 'whatsapp', 'outbound', 'pending_approval', 'agent', 'lead_desk', 'd0000000-0000-4000-8000-000000000002', 'Hello'
  from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011101';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.approvals) = 1, 'sales sees only lead replies';
  begin
    perform public.decide_approval('d0000000-0000-4000-8000-000000000001', 'approved');
    raise exception 'sales should not approve discounts';
  exception when others then
    if sqlerrm not like 'Approval not found%' and sqlerrm not like 'You cannot decide%' then raise; end if;
  end;
  perform public.decide_approval('d0000000-0000-4000-8000-000000000002', 'edited', '{"body":"Hello Meera!"}', 'warmer');
  assert (select body from public.messages where approval_id = 'd0000000-0000-4000-8000-000000000002') = 'Hello Meera!', 'edit applied to message';
  assert (select status from public.messages where approval_id = 'd0000000-0000-4000-8000-000000000002') = 'approved', 'message approved';
end $$;
rollback;

-- Paying the 40% unlocks décor.
begin;
update public.payments set status = 'paid', paid_at = now() where wedding_id = 'c0000000-0000-4000-8000-000000000001' and milestone = 'contract';
do $$
begin
  assert (select status from public.wedding_stages where wedding_id = 'c0000000-0000-4000-8000-000000000001' and key = 'decor') = 'not_started', 'décor unlocked after 40%';
end $$;
rollback;

select 'all SQL tests passed' as result;

-- Repeat enquiries keep the original question and queue one task for the Chief of Staff.
do $$
begin
  assert (select l.message from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011106')
         like 'Do you allow outside caterers?%Following up%', 'thread kept across touches';
  assert (select count(*) from public.agent_tasks t join public.leads l on l.id = t.lead_id join public.contacts c on c.id = l.contact_id
           where c.phone_e164 = '+919900011106' and t.status = 'queued') = 1, 'one queued task per lead';
  assert (select count(*) from public.agent_tasks where kind = 'new_lead') >= 6, 'every new lead queued for routing';
end $$;
select 'thread tests passed' as result;
