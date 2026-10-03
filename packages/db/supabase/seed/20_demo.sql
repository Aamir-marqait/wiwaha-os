-- =============================================================================
-- Demo data: one fictional couple (Ananya & Rohan) and a small sales pipeline,
-- so every screen can be demoed. Dates are relative to today, so the demo stays
-- fresh. Demo logins all use the password  WiwahaDemo!2026  — DELETE these
-- users before real client data goes in (docs/runbooks/setup.md).
-- =============================================================================
set app.surface = 'seed';

-- --- Demo users --------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in select * from (values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'prashanth@wiwaha.example', 'Prashanth', 'owner',         'Founder'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'kavya@wiwaha.example',     'Kavya Shetty', 'sales',      'Sales Executive'),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'arjun@wiwaha.example',     'Arjun Menon',  'event_manager', 'Event Manager'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'manju@wiwaha.example',     'Manjunath',    'staff',      'Estate Supervisor'),
    ('55555555-5555-4555-8555-555555555555'::uuid, 'lakshmi@wiwaha.example',   'Lakshmi Rao',  'accounts',   'Accounts'),
    ('66666666-6666-4666-8666-666666666666'::uuid, 'ananya@wiwaha.example',    'Ananya Rao',   'client',     null),
    ('77777777-7777-4777-8777-777777777777'::uuid, 'rohan@wiwaha.example',     'Rohan Mehta',  'client',     null),
    ('88888888-8888-4888-8888-888888888888'::uuid, 'sunita@wiwaha.example',    'Sunita Rao',   'client',     null)
  ) as t(id, email, name, role, title)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('WiwahaDemo!2026', extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role),
            jsonb_build_object('full_name', u.name), now(), now(), '', '', '', '')
    on conflict (id) do nothing;

    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (u.id, u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now())
    on conflict do nothing;

    update public.profiles set title = u.title, full_name = u.name where id = u.id;
  end loop;
end $$;

-- --- The couple: Ananya & Rohan ---------------------------------------------
insert into public.contacts (id, full_name, phone_e164, email, role, city, consent_whatsapp, consent_email) values
  ('a0000000-0000-4000-8000-000000000001', 'Ananya Rao',  '+919845000001', 'ananya@wiwaha.example', 'bride',  'Bengaluru', true, true),
  ('a0000000-0000-4000-8000-000000000002', 'Rohan Mehta', '+919845000002', 'rohan@wiwaha.example',  'groom',  'Bengaluru', true, true),
  ('a0000000-0000-4000-8000-000000000003', 'Sunita Rao',  '+919845000003', 'sunita@wiwaha.example', 'parent', 'Bengaluru', true, true)
on conflict do nothing;

insert into public.leads (id, contact_id, source, source_detail, date_wanted, guest_count, budget_paise, city, message,
                          score, hot, status, first_touch_at, last_touch_at)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'wedmegood', 'WedMeGood enquiry',
        current_date + 120, 260, 4500000 * 100, 'Bengaluru', 'Looking for a three-day wedding with rooms for family.',
        92, true, 'won', now() - interval '40 days', now() - interval '10 days')
on conflict do nothing;

insert into public.weddings (id, code, title, lead_id, primary_contact_id, event_start, event_end, guest_count,
                             stage, status, event_manager_id, sales_owner_id, booked_on, complimentary_rooms, notes)
values ('c0000000-0000-4000-8000-000000000001', 'WIW-DEMO-001', 'Ananya & Rohan',
        'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        current_date + 120, current_date + 122, 260, 'onboarding', 'active',
        '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
        current_date - 10, 20, 'Fictional demo wedding.')
on conflict do nothing;
update public.leads set wedding_id = 'c0000000-0000-4000-8000-000000000001' where id = 'b0000000-0000-4000-8000-000000000001';

insert into public.wedding_contacts (wedding_id, contact_id, relation, is_key_contact) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Bride', true),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Groom', true),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'Mother of the bride', true)
on conflict do nothing;

insert into public.wedding_members (wedding_id, user_id, contact_id, email, display_name, member_role,
                                    can_start_stages, can_edit_brief, can_approve, can_view_payments, can_manage_members, accepted_at) values
  ('c0000000-0000-4000-8000-000000000001', '66666666-6666-4666-8666-666666666666', 'a0000000-0000-4000-8000-000000000001', 'ananya@wiwaha.example', 'Ananya', 'couple', true, true, true, true, true, now()),
  ('c0000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'a0000000-0000-4000-8000-000000000002', 'rohan@wiwaha.example',  'Rohan',  'couple', true, true, true, true, true, now()),
  ('c0000000-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888', 'a0000000-0000-4000-8000-000000000003', 'sunita@wiwaha.example', 'Sunita (Amma)', 'parent', false, true, false, false, false, now())
on conflict do nothing;

-- ₹45 L contract → 10/40/50 schedule from the policy book; deposit is paid.
select app.create_payment_schedule('c0000000-0000-4000-8000-000000000001', 4500000 * 100);
update public.payments set status = 'paid', paid_at = now() - interval '9 days', paid_amount_paise = amount_paise, method = 'upi'
 where wedding_id = 'c0000000-0000-4000-8000-000000000001' and milestone = 'deposit';

select app.create_stage_cards('c0000000-0000-4000-8000-000000000001');
update public.wedding_stages set started_at = now() - interval '8 days', status = 'in_progress',
       owner_label = 'Arjun (event manager) + Brief agent'
 where wedding_id = 'c0000000-0000-4000-8000-000000000001' and key = 'brief';
select app.refresh_stage_locks('c0000000-0000-4000-8000-000000000001');

insert into public.event_functions (wedding_id, type, name, date, start_time, end_time, space_id, guest_count, sort)
select 'c0000000-0000-4000-8000-000000000001', f.type::public.function_type, f.name, current_date + f.d, f.st::time, f.et::time,
       (select id from public.spaces where name = f.space), f.g, f.s
  from (values
    ('mehendi',   'Mehendi',   120, '15:00', '19:00', 'Banyan Courtyard', 120, 10),
    ('sangeet',   'Sangeet',   120, '19:30', '23:30', 'The Pavilion',     220, 20),
    ('wedding',   'Wedding',   121, '07:00', '13:00', 'The Grand Lawn',   260, 30),
    ('reception', 'Reception', 122, '19:00', '23:30', 'The Grand Lawn',   260, 40)
  ) as f(type, name, d, st, et, space, g, s);

-- Calendar: the wedding's spaces are confirmed; 20 complimentary rooms confirmed.
insert into public.calendar_entries (resource_kind, space_id, starts_on, ends_on, status, label, wedding_id, lead_id)
select 'space', s.id, current_date + 120, current_date + 122, 'confirmed', 'Ananya & Rohan',
       'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001'
  from public.spaces s where s.name in ('The Grand Lawn', 'Banyan Courtyard', 'The Pavilion');
insert into public.calendar_entries (resource_kind, room_id, starts_on, ends_on, status, label, wedding_id)
select 'room', r.id, current_date + 119, current_date + 122, 'confirmed', 'Ananya & Rohan', 'c0000000-0000-4000-8000-000000000001'
  from public.rooms r where r.active order by r.sort limit 20;

insert into public.messages (wedding_id, channel, direction, status, author_kind, agent_key, body, client_visible, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'portal', 'outbound', 'sent', 'staff', null,
   'Welcome to Wiwaha, Ananya and Rohan! Your date is held and your planning space is ready. Start with "Our wedding" whenever you like.', true, now() - interval '9 days');

-- --- Sales pipeline (through the real intake function, so dedupe applies) -----
select public.ingest_lead(jsonb_build_object(
  'full_name', 'Meera Iyer', 'phone_e164', '+919900011101', 'email', 'meera.iyer@example.com', 'source', 'wedmegood',
  'source_detail', 'WedMeGood premium listing', 'date_wanted', (current_date + 200)::text, 'guest_count', 250,
  'budget_paise', 4000000 * 100, 'city', 'Bengaluru', 'consent_whatsapp', true,
  'message', 'Hi! We loved the photos of the lawn. Is your venue available for our wedding? We''re around 250 guests and would need rooms for close family.'));
select public.ingest_lead(jsonb_build_object(
  'full_name', 'Farhan Sheikh', 'phone_e164', '+919900011102', 'source', 'instagram', 'date_wanted', (current_date + 95)::text,
  'guest_count', 600, 'city', 'Bengaluru', 'message', 'What''s the price for 600 people? Need it cheap, can you give a discount?'));
select public.ingest_lead(jsonb_build_object(
  'full_name', 'Priya Natarajan', 'phone_e164', '+919900011103', 'email', 'priya.n@example.com', 'source', 'website',
  'date_wanted', (current_date + 150)::text, 'guest_count', 180, 'budget_paise', 3000000 * 100, 'city', 'Bengaluru',
  'message', 'Karthik and I would like to see the venue this weekend.'));
select public.ingest_lead(jsonb_build_object(
  'full_name', 'Rhea Kapoor', 'phone_e164', '+919900011104', 'email', 'rhea.k@example.com', 'source', 'phone',
  'date_wanted', (current_date + 240)::text, 'guest_count', 300, 'city', 'Mumbai',
  'message', 'Calling from Mumbai. Family would like to hold the date while we plan a trip down.'));
select public.ingest_lead(jsonb_build_object(
  'full_name', 'Deepak Nair', 'phone_e164', '+919900011105', 'source', 'referral', 'source_detail', 'Referred by a past couple',
  'date_wanted', (current_date + 170)::text, 'guest_count', 200, 'city', 'Bengaluru'));
-- Sneha writes twice (website then WhatsApp): the second touch attaches to the same lead.
select public.ingest_lead(jsonb_build_object(
  'full_name', 'Sneha Kulkarni', 'phone_e164', '+919900011106', 'source', 'website',
  'date_wanted', (current_date + 130)::text, 'guest_count', 150, 'city', 'Pune', 'message', 'Do you allow outside caterers?'));
select public.ingest_lead(jsonb_build_object(
  'full_name', 'Sneha K', 'phone_e164', '+91 99000 11106', 'source', 'whatsapp', 'message', 'Following up on my website enquiry!'));

-- Pipeline states
update public.leads l set status = 'visit_booked', assigned_to = '22222222-2222-4222-8222-222222222222', score = 71
  from public.contacts c where c.id = l.contact_id and c.phone_e164 = '+919900011103';
insert into public.visits (lead_id, scheduled_at, executive_id, attendees, attendee_count, pre_visit_brief)
select l.id, date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' + interval '1 day 11 hours',
       '22222222-2222-4222-8222-222222222222', 'Priya, Karthik and both mothers', 4,
       '180 guests, date in ~5 months, interested in the Pavilion for sangeet.'
  from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011103';

update public.leads l set status = 'visited', assigned_to = '22222222-2222-4222-8222-222222222222', score = 68
  from public.contacts c where c.id = l.contact_id and c.phone_e164 = '+919900011105';
insert into public.visits (lead_id, scheduled_at, executive_id, attendees, attendee_count, status, notes, follow_up_due_at, checklist)
select l.id, now() - interval '2 days', '22222222-2222-4222-8222-222222222222', 'Deepak and parents', 3, 'completed',
       'Loved the Grand Lawn; worried about parking for 60 cars.', now(), '{"uniform": true, "refreshments": true, "space_dressed": true, "brochure": true}'
  from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011105';

update public.leads l set status = 'contacted', assigned_to = '22222222-2222-4222-8222-222222222222', score = 64
  from public.contacts c where c.id = l.contact_id and c.phone_e164 = '+919900011104';
-- Rhea's soft hold on the Grand Lawn expires in ~20 hours.
select public.place_hold('space', (select id from public.spaces where name = 'The Grand Lawn'),
       current_date + 240, current_date + 241,
       (select l.id from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011104'),
       20, 'Rhea Kapoor (hold)');
-- An enquiry pencil mark (doesn't block) for Meera's date.
insert into public.calendar_entries (resource_kind, space_id, starts_on, ends_on, status, label, lead_id)
select 'space', (select id from public.spaces where name = 'The Grand Lawn'), current_date + 200, current_date + 200, 'enquiry',
       'Meera Iyer (enquiry)', l.id
  from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011101';

-- Escalation in the human queue: out-of-town caller asked for price, band not approved yet.
insert into public.human_queue (agent_key, reason, title, detail, lead_id, assigned_role)
select 'lead_desk', 'off_policy', 'Out-of-town family asked for a starting price',
       'Rhea (Mumbai) asked for a starting-from price. The policy allows a band for out-of-town callers, but no figure has been approved yet. Please approve a band in the policy book or call her back.',
       l.id, 'owner'
  from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011104';

-- --- Tasks (one overdue) -------------------------------------------------------
insert into public.tasks (scope, wedding_id, title, owner_id, owner_role, due_at, priority, proof_kind, t_minus_days) values
  ('wedding', 'c0000000-0000-4000-8000-000000000001', 'Welcome call with Ananya & Rohan: walk through the portal', '33333333-3333-4333-8333-333333333333', 'event_manager', now() - interval '1 day', 'high', 'tick', null),
  ('wedding', 'c0000000-0000-4000-8000-000000000001', 'Send 40% contract payment reminder (due in 4 days)', '55555555-5555-4555-8555-555555555555', 'accounts', now() + interval '1 day', 'normal', 'tick', null),
  ('wedding', 'c0000000-0000-4000-8000-000000000001', 'Draft run-of-show for mehendi and sangeet', '33333333-3333-4333-8333-333333333333', 'event_manager', now() + interval '6 days', 'normal', 'file', null);
insert into public.tasks (scope, title, owner_id, owner_role, due_at, priority, proof_kind, maintenance_id)
select 'estate', 'AC servicing overdue: book technician', '44444444-4444-4444-8444-444444444444', 'staff', now() - interval '5 days', 'high', 'photo', m.id
  from public.maintenance_schedules m where m.category = 'ac';
insert into public.tasks (scope, title, owner_id, owner_role, due_at, priority, proof_kind)
values ('estate', 'Diesel below reorder level: order 500 litres', '44444444-4444-4444-8444-444444444444', 'staff', now() + interval '1 day', 'urgent', 'photo');
insert into public.tasks (scope, lead_id, title, owner_id, owner_role, due_at, priority, proof_kind)
select 'sales', l.id, 'Follow-up call with Deepak Nair (the one call, 2 days after visit)', '22222222-2222-4222-8222-222222222222', 'sales', now(), 'high', 'tick'
  from public.leads l join public.contacts c on c.id = l.contact_id where c.phone_e164 = '+919900011105';

reset app.surface;
