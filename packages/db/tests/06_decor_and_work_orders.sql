-- Décor stock can't be over-promised; returns update condition; work orders
-- are approved only by Prashanth or an event manager (D37).
\set ON_ERROR_STOP 1

do $$
declare v_item uuid; v_w uuid := 'c0000000-0000-4000-8000-000000000001'; v_ok boolean; v_a uuid;
begin
  insert into public.decor_items (name, quantity, condition) values ('Test brass urli', 4, 'good') returning id into v_item;
  insert into public.decor_assignments (decor_item_id, wedding_id, area, quantity) values (v_item, v_w, 'Main door entry', 3) returning id into v_a;
  begin
    insert into public.decor_assignments (decor_item_id, wedding_id, area, quantity) values (v_item, v_w, 'Lobby', 2);
    v_ok := true;
  exception when others then v_ok := sqlerrm not like 'Only 1 of%';
  end;
  assert not v_ok, 'cannot promise more than we own on overlapping dates';
  insert into public.decor_assignments (decor_item_id, wedding_id, area, quantity) values (v_item, v_w, 'Lobby', 1);
  update public.decor_assignments set status = 'returned', return_condition = 'needs_repair' where id = v_a;
  assert (select condition from public.decor_items where id = v_item) = 'needs_repair', 'condition on return updates the piece';
  delete from public.decor_items where id = v_item;
end $$;

-- The couple can't see the décor store.
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.decor_items) = 0, 'clients do not see décor stock'; end $$;
rollback;

-- Work orders: drafted, then approved by an event manager (not accounts).
do $$
declare v_vendor uuid; v_b uuid;
begin
  select id into v_vendor from public.vendors limit 1;
  insert into public.vendor_bookings (vendor_id, wedding_id, status) values (v_vendor, 'c0000000-0000-4000-8000-000000000001', 'requested') returning id into v_b;
  assert (select work_order_approved_at is null from public.vendor_bookings where id = v_b), 'new work orders start unapproved';
  perform set_config('test.booking', v_b::text, false);
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_ok boolean;
begin
  begin perform public.approve_work_order(current_setting('test.booking')::uuid); v_ok := true; exception when insufficient_privilege then v_ok := false; end;
  assert not v_ok, 'accounts cannot approve a work order';
end $$;
rollback;
begin;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.approve_work_order(current_setting('test.booking')::uuid);
end $$;
commit;
do $$
begin
  assert (select work_order_approved_at is not null from public.vendor_bookings where id = current_setting('test.booking')::uuid), 'approved';
  assert exists (select 1 from public.agent_tasks where kind = 'work_order_approved' and payload ->> 'booking_id' = current_setting('test.booking')), 'sending queued for the Vendor Coordinator';
  delete from public.agent_tasks where kind = 'work_order_approved';
  delete from public.vendor_bookings where id = current_setting('test.booking')::uuid;
end $$;
