-- Access sections and payment parts (D34).
\set ON_ERROR_STOP 1

-- Staff can't give themselves more sections; the owner can.
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_ok boolean;
begin
  begin
    update public.profiles set sections = '{accounts}' where id = '22222222-2222-4222-8222-222222222222';
    v_ok := true;
  exception when insufficient_privilege then v_ok := false;
  end;
  assert not v_ok, 'sales cannot change their own sections';
end $$;
rollback;

begin;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
update public.profiles set sections = '{sales_marketing,weddings}' where id = '22222222-2222-4222-8222-222222222222';
rollback;

-- Seeded parts carry their effect.
do $$
begin
  assert not exists (select 1 from public.payments where effect is null), 'every payment part has an effect';
end $$;

-- Only the owner sets parts; they must add to 100%; paid parts stay.
do $$
declare v_w uuid; v_ok boolean; v_paid public.payments; v_parts jsonb; v_total bigint;
begin
  select wedding_id into v_w from public.payments where status = 'paid' limit 1;
  assert v_w is not null, 'seed has a paid part';
  select * into v_paid from public.payments where wedding_id = v_w and status = 'paid' order by sort limit 1;

  -- not 100%
  v_parts := jsonb_build_array(
    jsonb_build_object('id', v_paid.id, 'label', v_paid.label, 'percent_bps', v_paid.percent_bps, 'due_on', v_paid.due_on, 'effect', v_paid.effect),
    jsonb_build_object('label', 'Rest', 'percent_bps', 5000, 'due_on', '2031-01-01', 'effect', 'final'));
  begin perform app.set_payment_parts(v_w, v_parts); v_ok := true; exception when others then v_ok := false; end;
  assert not v_ok, 'parts must add up to 100%';

  -- changing a paid part is refused
  v_parts := jsonb_build_array(
    jsonb_build_object('id', v_paid.id, 'label', v_paid.label, 'percent_bps', v_paid.percent_bps + 500, 'due_on', v_paid.due_on, 'effect', v_paid.effect),
    jsonb_build_object('label', 'Rest', 'percent_bps', 10000 - v_paid.percent_bps - 500, 'due_on', '2031-01-01', 'effect', 'final'));
  begin perform app.set_payment_parts(v_w, v_parts); v_ok := true; exception when others then v_ok := false; end;
  assert not v_ok, 'a paid part cannot change';

  -- a valid four-part split (as the service role, standing in for the owner)
  v_parts := jsonb_build_array(
    jsonb_build_object('id', v_paid.id, 'label', v_paid.label, 'percent_bps', v_paid.percent_bps, 'due_on', v_paid.due_on, 'effect', v_paid.effect),
    jsonb_build_object('label', '30% signs the contract', 'percent_bps', 3000, 'due_on', '2030-01-01', 'effect', 'signs_contract'),
    jsonb_build_object('label', '30% second part', 'percent_bps', 3000, 'due_on', '2030-06-01', 'effect', 'none'),
    jsonb_build_object('label', 'Final', 'percent_bps', 10000 - v_paid.percent_bps - 6000, 'due_on', '2031-01-01', 'effect', 'final'));
  perform app.set_payment_parts(v_w, v_parts);
  assert (select count(*) from public.payments where wedding_id = v_w) = 4, 'four parts';
  select contract_value_paise into v_total from public.weddings where id = v_w;
  assert (select sum(amount_paise) from public.payments where wedding_id = v_w) = v_total, 'amounts add up to the contract value';
  assert (select status from public.payments where id = v_paid.id) = 'paid', 'the paid part is untouched';
end $$;

begin;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_ok boolean; v_w uuid;
begin
  select wedding_id into v_w from public.payments limit 1;
  begin perform public.set_payment_parts(v_w, '[]'::jsonb); v_ok := true; exception when insufficient_privilege then v_ok := false; end;
  assert not v_ok, 'accounts cannot change payment parts';
end $$;
rollback;
