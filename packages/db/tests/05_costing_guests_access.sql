-- Costing stays internal, vendor answers and final choices reach the agents,
-- guest requests are staff-only, and portal logins close after the wedding (D36).
\set ON_ERROR_STOP 1

-- Our costs: Prashanth and accounts only, never the couple.
do $$
declare v_q uuid; v_l uuid;
begin
  insert into public.quotes (wedding_id, version, status, subtotal_paise, tax_paise, total_paise)
  values ('c0000000-0000-4000-8000-000000000001', 99, 'sent', 100, 18, 118) returning id into v_q;
  insert into public.quote_lines (quote_id, description, quantity, unit_price_paise, line_total_paise)
  values (v_q, 'Test line', 1, 100, 100) returning id into v_l;
  insert into public.quote_line_costs (id, prescribed_unit_paise, unit_cost_paise) values (v_l, 120, 60);
  perform set_config('test.line', v_l::text, false);
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.quote_lines where id = current_setting('test.line')::uuid) = 1, 'the couple sees their sent quote line';
  assert (select count(*) from public.quote_line_costs) = 0, 'the couple never sees our costs';
end $$;
rollback;
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.quote_line_costs) = 0, 'sales does not see the costing'; end $$;
rollback;
begin;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.quote_line_costs) >= 1, 'accounts sees the costing'; end $$;
rollback;
delete from public.quotes where version = 99;

-- A vendor's answer (link or phone) and a final choice queue work for the agents.
do $$
declare v_vendor uuid; v_b uuid; v_s uuid;
begin
  select id into v_vendor from public.vendors limit 1;
  insert into public.vendor_bookings (vendor_id, wedding_id, status) values (v_vendor, 'c0000000-0000-4000-8000-000000000001', 'requested') returning id into v_b;
  update public.vendor_bookings set status = 'confirmed' where id = v_b;
  assert exists (select 1 from public.agent_tasks where kind = 'vendor_replied' and payload ->> 'booking_id' = v_b::text), 'vendor answer queued';
  insert into public.wedding_selections (wedding_id, vertical, name, status) values ('c0000000-0000-4000-8000-000000000001', 'extras', 'Test extra', 'chosen') returning id into v_s;
  update public.wedding_selections set status = 'final' where id = v_s;
  assert exists (select 1 from public.agent_tasks where kind = 'selection_finalised' and payload ->> 'selection_id' = v_s::text), 'final choice queued';
  delete from public.agent_tasks where kind in ('vendor_replied', 'selection_finalised');
  delete from public.vendor_bookings where id = v_b;
  delete from public.wedding_selections where id = v_s;
end $$;

-- Guest requests are for staff; every wedding has its own guest link.
do $$
begin
  assert not exists (select 1 from public.weddings where guest_token is null or length(guest_token) <> 24), 'every wedding has a guest token';
  insert into public.guest_requests (wedding_id, option_name, guest_name, quantity) values ('c0000000-0000-4000-8000-000000000001', 'Laundry', 'Test Guest', 1);
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.guest_requests) = 0, 'the couple cannot read guest requests'; end $$;
rollback;
delete from public.guest_requests where guest_name = 'Test Guest';

-- Portal logins close after the wedding day; staff can keep them open.
update public.weddings set event_start = current_date - 3, event_end = current_date - 1 where id = 'c0000000-0000-4000-8000-000000000001';
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.weddings) = 0, 'portal closed: the couple no longer sees the wedding';
  assert not app.member_can('c0000000-0000-4000-8000-000000000001', 'approve'), 'and can no longer approve anything';
  assert (select count(*) from public.my_closed_portal()) = 1, 'the thank-you screen knows which wedding closed';
end $$;
rollback;
update public.weddings set portal_access_until = current_date + 7 where id = 'c0000000-0000-4000-8000-000000000001';
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.weddings) = 1, 'kept open by staff'; end $$;
rollback;
update public.weddings set event_start = current_date + 120, event_end = current_date + 121, portal_access_until = null where id = 'c0000000-0000-4000-8000-000000000001';
