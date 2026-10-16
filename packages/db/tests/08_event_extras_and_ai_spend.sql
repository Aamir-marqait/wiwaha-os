-- Per-event décor extras (D42): rented pieces cost the wedding; bought pieces
-- join the stock and are assigned to the event; cancelling removes the cost.
\set ON_ERROR_STOP 1

do $$
declare v_w uuid := 'c0000000-0000-4000-8000-000000000001'; v_rent uuid; v_buy uuid; v_item uuid; v_top uuid;
begin
  insert into public.event_decor_extras (wedding_id, name, kind, supplier, quantity, unit_cost_paise, area)
  values (v_w, 'Crystal chandeliers', 'rented', 'Lights & Co', 4, 250000, 'Mandap') returning id into v_rent;
  assert (select amount_paise from public.cost_entries c join public.event_decor_extras e on e.cost_entry_id = c.id where e.id = v_rent) = 1000000,
    'a rented piece puts its cost on the wedding';
  assert (select decor_item_id is null from public.event_decor_extras where id = v_rent), 'rented pieces never join our stock';

  insert into public.event_decor_extras (wedding_id, name, kind, quantity, unit_cost_paise, area)
  values (v_w, 'Brass uruli (large)', 'purchased', 2, 450000, 'Main door entry') returning id into v_buy;
  assert (select decor_item_id is null from public.event_decor_extras where id = v_buy), 'an ordered piece joins the stock only when it arrives';
  update public.event_decor_extras set status = 'received' where id = v_buy;
  select decor_item_id into v_item from public.event_decor_extras where id = v_buy;
  assert v_item is not null, 'a bought piece becomes stock when received';
  assert (select quantity from public.decor_items where id = v_item) = 2, 'with the quantity bought';
  assert (select count(*) from public.decor_assignments where decor_item_id = v_item and wedding_id = v_w and area = 'Main door entry') = 1,
    'and is assigned to the event it was bought for';
  -- Receiving it again doesn't double the stock.
  update public.event_decor_extras set status = 'returned' where id = v_buy;
  assert (select quantity from public.decor_items where id = v_item) = 2, 'stock is added once';

  -- Topping up a piece we already own.
  insert into public.event_decor_extras (wedding_id, name, kind, quantity, unit_cost_paise, decor_item_id, status)
  values (v_w, 'Brass uruli (large)', 'purchased', 1, 450000, v_item, 'received') returning id into v_top;
  assert (select quantity from public.decor_items where id = v_item) = 3, 'buying more of a piece we own tops it up';

  -- Cost follows edits, and goes when cancelled.
  update public.event_decor_extras set quantity = 5 where id = v_rent;
  assert (select amount_paise from public.cost_entries c join public.event_decor_extras e on e.cost_entry_id = c.id where e.id = v_rent) = 1250000,
    'changing the quantity changes the cost';
  update public.event_decor_extras set status = 'cancelled' where id = v_rent;
  assert (select cost_entry_id is null from public.event_decor_extras where id = v_rent), 'cancelling removes the cost';
  assert (select count(*) from public.cost_entries where description like 'Rented: Crystal chandeliers%') = 0, 'the cost row is gone';

  delete from public.event_decor_extras where wedding_id = v_w;
  delete from public.cost_entries where description like 'Bought: Brass uruli%';
  delete from public.decor_items where id = v_item;
end $$;

-- The couple sees none of it; an event manager can add an extra.
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.event_decor_extras) = 0, 'clients do not see event extras'; end $$;
rollback;

begin;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  insert into public.event_decor_extras (wedding_id, name, kind, quantity, unit_cost_paise) values ('c0000000-0000-4000-8000-000000000001', 'Pampas grass', 'purchased', 10, 30000);
  assert (select count(*) from public.event_decor_extras) = 1, 'event managers record extras (their cost lands in costing through the trigger)';
end $$;
rollback;

-- AI spend is visible to owner and accounts only.
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.policies where key = 'media.budget') = 1, 'the AI budget is in the policy book'; end $$;
rollback;
