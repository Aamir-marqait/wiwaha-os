-- =============================================================================
-- Reference data: spaces, rooms, price book, T-minus templates, vendors,
-- inventory and maintenance. Space names, prices and vendors are PLACEHOLDERS
-- for the demo; replace them with Wiwaha's real data before go-live.
-- =============================================================================
set app.surface = 'seed';

insert into public.spaces (name, kind, capacity_seated, capacity_floating, description, color, sort) values
  ('The Grand Lawn',       'outdoor',   600, 1000, 'Main lawn for weddings and receptions, mandap-ready with power points.', '#7C9A7E', 10),
  ('Banyan Courtyard',     'outdoor',   250,  400, 'Shaded courtyard under the old banyan, ideal for haldi and mehendi.',   '#A3B18A', 20),
  ('The Pavilion',         'semi_open', 400,  600, 'Covered pavilion, monsoon-safe, for sangeet and dinners.',              '#C9A45C', 30),
  ('Sage Hall',            'indoor',    200,  300, 'Air-conditioned banquet hall for intimate functions.',                  '#8E5A63', 40),
  ('Poolside Deck',        'outdoor',   120,  200, 'Deck beside the pool for cocktails and welcome dinners.',               '#6F8FAF', 50)
on conflict (name) do nothing;

-- 30 rooms today (101–115 deluxe, 201–212 premium, 301–303 suites)…
insert into public.rooms (number, room_type, capacity, block, floor, sort, active)
select n::text, 'deluxe', 2, 'East wing', 1, n, true from generate_series(101, 115) n
union all
select n::text, 'premium', 3, 'West wing', 2, n, true from generate_series(201, 212) n
union all
select n::text, 'suite', 4, 'Garden villas', 3, n, true from generate_series(301, 303) n
on conflict (number) do nothing;
-- …and the 30 rooms of the planned expansion, inactive until built.
insert into public.rooms (number, room_type, capacity, block, floor, sort, active, notes)
select n::text, 'deluxe', 2, 'New wing (planned)', 1, n, false, 'Expansion to 60 rooms' from generate_series(401, 430) n
on conflict (number) do nothing;

insert into public.price_book_items (code, category, name, unit, unit_price_paise, gst_rate_bps, design_kind, notes) values
  ('VEN-DAY',      'venue',    'Estate exclusive use, per day',          'per_day',   950000 * 100, 1800, null, 'Placeholder price'),
  ('ROOM-NIGHT',   'rooms',    'Additional room night',                  'per_night',   8500 * 100, 1200, null, 'Beyond complimentary allocation'),
  ('CAT-VEG-STD',  'catering', 'Vegetarian menu — standard',             'per_plate',   1650 * 100,  500, null, null),
  ('CAT-VEG-PREM', 'catering', 'Vegetarian menu — premium',              'per_plate',   2400 * 100,  500, null, null),
  ('CAT-NV-STD',   'catering', 'Non-vegetarian menu — standard',         'per_plate',   1950 * 100,  500, null, null),
  ('DEC-MANDAP-S', 'decor',    'Mandap — catalogue design',              'each',      350000 * 100, 1800, 'standard', null),
  ('DEC-HALDI-S',  'decor',    'Haldi set-up — catalogue design',        'each',       90000 * 100, 1800, 'standard', null),
  ('DEC-SANGEET-S','decor',    'Sangeet stage — catalogue design',       'each',      180000 * 100, 1800, 'standard', null),
  ('AV-SOUND',     'av',       'Sound and lighting package, per function','each',      75000 * 100, 1800, null, null),
  ('SVC-VALET',    'services', 'Valet and parking team, per day',        'per_day',     25000 * 100, 1800, null, null)
on conflict (code) do nothing;

insert into public.task_templates (plan_key, t_minus_days, title, default_role, priority, proof_kind, buffer_hours, sort) values
  ('standard_wedding', 90, 'Kick-off call with the couple; confirm functions and guest counts', 'event_manager', 'high',   'tick',  48, 10),
  ('standard_wedding', 90, 'Share menu options and book tasting slot',                         'event_manager', 'normal', 'tick',  48, 20),
  ('standard_wedding', 60, 'Collect rooming list and arrival details',                          'event_manager', 'normal', 'file',  48, 30),
  ('standard_wedding', 60, 'Lock décor moodboards (custom work approved by Prashanth)',        'event_manager', 'high',   'tick',  48, 40),
  ('standard_wedding', 30, 'Final payment received (50%)',                                      'accounts',      'urgent', 'tick',  24, 50),
  ('standard_wedding', 30, 'Vendor dates confirmed in writing',                                 'event_manager', 'high',   'file',  24, 60),
  ('standard_wedding', 14, 'Run-of-show shared with staff and vendors',                         'event_manager', 'high',   'file',  24, 70),
  ('standard_wedding',  7, 'Generator serviced and diesel stocked',                             'staff',         'urgent', 'photo', 12, 80),
  ('standard_wedding',  7, 'Rooms deep-cleaned and inspected',                                  'staff',         'high',   'photo', 12, 90),
  ('standard_wedding',  1, 'Spaces dressed and walk-through with the couple',                   'event_manager', 'urgent', 'photo',  6, 100),
  ('standard_wedding',  0, 'Welcome desk and airport pickups running',                          'staff',         'urgent', 'tick',   2, 110),
  ('standard_wedding', -1, 'Handover inspection and damage check with photos',                  'staff',         'high',   'photo', 12, 120);

insert into public.vendors (name, category, contact_name, phone_e164, email, rating, preferred, designated_planner, notes) values
  ('Golden Hour Studios',  'photography', 'Nikhil',  '+919800000101', 'hello@goldenhour.example', 4.8, true,  false, 'Demo vendor'),
  ('Marigold & Co.',       'decor',       'Sana',    '+919800000102', 'team@marigold.example',    4.6, true,  true,  'Demo designated planner'),
  ('Rhythm House DJs',     'music',       'Vikram',  '+919800000103', 'bookings@rhythm.example',  4.4, false, false, 'Demo vendor'),
  ('Glow Bridal Studio',   'makeup',      'Fatima',  '+919800000104', 'glow@bridal.example',      4.7, true,  false, 'Demo vendor');

insert into public.inventory_items (name, category, quantity, unit, location, reorder_level) values
  ('Chiavari chairs (gold)', 'furniture',   480, 'pcs', 'Store A', 400),
  ('Round tables (6 ft)',    'furniture',    60, 'pcs', 'Store A', 50),
  ('Table linen (ivory)',    'linen',       140, 'pcs', 'Laundry', 120),
  ('Bath towels',            'linen',        95, 'pcs', 'Laundry', 120),
  ('Dinner plates',          'crockery',    900, 'pcs', 'Kitchen store', 700),
  ('Diesel',                 'consumables', 380, 'litres', 'Generator yard', 500);

insert into public.maintenance_schedules (name, category, frequency_days, last_done_on, next_due_on) values
  ('Lawn mowing and edging',  'garden',       7,  current_date - 6,  current_date + 1),
  ('Pool cleaning',           'pool',         3,  current_date - 3,  current_date),
  ('AC servicing (all rooms)', 'ac',          90, current_date - 95, current_date - 5),
  ('Generator service',       'generator',   30,  current_date - 28, current_date + 2),
  ('Pest control',            'pest_control', 30, current_date - 12, current_date + 18);
