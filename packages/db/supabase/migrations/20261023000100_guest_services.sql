-- What guests can ask for on the couple's "Additional services" link (D46):
-- airport pickup and drop and a few stay add-ons. The team confirms each
-- request by phone; nothing is charged. Editable under Venue → Extras.
insert into public.service_options (vertical, category, name, description, unit, guest_bookable, sort) values
  ('extras', 'Transport', 'Airport pickup', 'A car from Bengaluru airport (15 km) to Wiwaha. Tell us the flight and arrival time.', 'each', true, 10),
  ('extras', 'Transport', 'Airport drop', 'A car from Wiwaha to Bengaluru airport. Tell us the flight and departure time.', 'each', true, 20),
  ('extras', 'Stay', 'Early check-in or late check-out', 'We will do our best, subject to the rooms being free.', 'each', true, 30),
  ('extras', 'Stay', 'Extra bed or mattress', 'An extra bed in your room.', 'each', true, 40)
on conflict (vertical, name) do nothing;
