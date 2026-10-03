-- =============================================================================
-- Wiwaha OS · 0016 · Phase 2–4 data: new policy rules, agents switched on
-- (still in draft), and the menu library. Policy rows are generated from
-- @wiwaha/policy defaults (scripts/gen-policy-migration.ts) so wording matches
-- the seed exactly. Existing rows are never overwritten.
-- =============================================================================
insert into public.policies (key, topic, title, rule_text, value, client_visible, needs_confirmation, sort) values
  ('channels.replies', 'Sales', 'Replies and hot-lead alerts', 'Agents reply on the same channel the enquiry came in on (WhatsApp, Instagram, email or website chat). Hot leads are sent to the sales executive on WhatsApp straight away.', '{"reply_on_same_channel":true,"fallback_channel":"whatsapp","hot_lead_alert_channel":"whatsapp","hot_lead_alert_role":"sales","website_chat_enabled":true}'::jsonb, false, false, 37),
  ('visits.booking', 'Sales', 'Booking site visits', 'Site visits are booked in 90-minute slots between 10 am and 6 pm, any day of the week, at least 4 hours ahead. The family gets a WhatsApp confirmation with the location pin and a reminder the day before.', '{"slot_minutes":90,"open_from":"10:00","open_until":"18:00","days_open":[0,1,2,3,4,5,6],"lead_time_hours":4,"reminder_hours_before":24,"confirmation_channel":"whatsapp","location_name":"Wiwaha by Praman, near Devanahalli (15 km from Bengaluru airport)","location_pin_url":null}'::jsonb, false, true, 31),
  ('voice.concierge', 'Sales', 'Phone concierge', 'Every call is answered 24x7 and recorded (the caller is told). The concierge hands the call to the sales team when the caller asks for a person, is upset, or asks something outside the policy book. If nobody picks up, it promises a callback within 30 minutes and creates an urgent task.', '{"hours":"24x7","record_calls":true,"announce_recording":true,"transfer_to_role":"sales","transfer_number_e164":null,"callback_within_minutes":30,"transfer_on":["asked_for_person","upset","off_policy"]}'::jsonb, false, true, 21),
  ('reviews.replies', 'Sales', 'Replying to reviews', 'Replies to Google and WedMeGood reviews are drafted for approval before posting. Happy couples (4 or 5 stars) are asked whether we may use their words as a testimonial.', '{"platforms":["google","wedmegood"],"reply_needs_approval":true,"capture_testimonial_min_score":4}'::jsonb, false, false, 101),
  ('contracts.process', 'Bookings', 'Contract approval', 'Prashanth approves every contract before it is sent for e-signature.', '{"owner_approves_before_send":true,"esign_provider":"digio","template_version":"standard_bw_v1"}'::jsonb, false, false, 51),
  ('onboarding.welcome', 'Bookings', 'Welcome and logins', 'When the 10% deposit arrives, the couple receives a welcome letter and their portal logins on WhatsApp and email, and a family WhatsApp group is set up with the key family contacts and our management.', '{"trigger":"deposit_paid","channels":["whatsapp","email"],"whatsapp_group_members":["couple","parent","owner","event_manager"]}'::jsonb, true, false, 52),
  ('portal.nudges', 'Planning', 'Portal reminders', 'If a planning stage hasn''t started by its recommended date, the portal sends one gentle reminder; three days later the event manager calls. The couple can snooze a stage for up to 30 days with a reason.', '{"nudge_days_after_recommended":0,"call_task_days_after_nudge":3,"snooze_max_days":30}'::jsonb, true, false, 86),
  ('menus.rules', 'Planning', 'Menus and catering', 'Menus can be South Indian, North Indian, Continental, Rajasthani or Pan-Asian, or the family may bring an outside caterer. Tastings are booked at least 7 days ahead, and plate counts lock 14 days before the event.', '{"cuisines":["South Indian","North Indian","Continental","Rajasthani","Pan-Asian"],"outside_caterer_rules":"Outside caterers work from the service kitchen, bring their own staff and equipment, and follow the estate''s safety and clean-up rules.","tasting_lead_days":7,"plate_count_lock_days_before":14}'::jsonb, true, true, 87),
  ('quotes.rules', 'Planning', 'Quotes', 'Quotes are priced only from the price book and stay valid for 30 days. Any line not in the price book, and any custom décor, waits for Prashanth''s approval before the couple sees the quote.', '{"validity_days":30,"off_book_needs_owner":true,"custom_decor_needs_owner":true}'::jsonb, false, false, 88),
  ('vendors.lockin', 'Planning', 'Vendor lock-in', 'Once the couple approves the quote, our preferred vendors are asked to confirm the dates. Vendors who haven''t replied are chased every 48 hours, up to three times, then the event manager steps in.', '{"chase_after_hours":48,"max_chases":3,"escalate_after_chases":true}'::jsonb, false, false, 89),
  ('tasks.escalation', 'Operations', 'Overdue tasks', 'A task still open after its buffer goes to the event manager; if it is still open 24 hours later it goes to Prashanth.', '{"to_event_manager_after_buffer":true,"to_owner_after_hours":24}'::jsonb, false, false, 121),
  ('rooms.operations', 'Operations', 'Rooms and guests', 'Check-in is from 2 pm and check-out by 11 am. Housekeeping allows 45 minutes per room between guests. Airport pickups run from Bengaluru T1 and T2.', '{"check_in_time":"14:00","check_out_time":"11:00","housekeeping_minutes_per_room":45,"pickup_points":["BLR T1","BLR T2"]}'::jsonb, true, true, 122),
  ('estate.purchases', 'Operations', 'Purchases', 'Purchases above ₹25,000 need Prashanth''s approval. Low-stock alerts go to the estate team.', '{"owner_approval_above_paise":2500000,"low_stock_alert_role":"staff"}'::jsonb, false, true, 123),
  ('finance.gst', 'Finance', 'GST and invoices', 'Invoices show GST per line: venue, décor, AV and services at 18%, rooms at 12% and catering at 5%. Invoices are exported for the accountant as Tally-ready CSV.', '{"rates_bps":{"venue":1800,"rooms":1200,"catering":500,"decor":1800,"av":1800,"services":1800},"gstin":null,"invoice_prefix":"WIW","state_code":"29","export_format":"tally_csv"}'::jsonb, false, true, 124),
  ('closeout.inspection', 'Operations', 'Handover inspection', 'After every event the estate is inspected with photos. Any damage is recorded, and Prashanth decides on the security deposit.', '{"photo_required":true,"security_deposit_paise":null,"deposit_decision_role":"owner"}'::jsonb, false, true, 125),
  ('offboarding.sequence', 'After the wedding', 'Farewell sequence', 'Three days after the event the couple gets a thank-you note, their photo-sharing link and the review form; the parting gift follows the next day, the newsletter invitation after that, and a referral ask two weeks later. We send anniversary wishes every year.', '{"steps":[{"key":"thank_you","days_after_event":3},{"key":"photo_sharing","days_after_event":3},{"key":"review_form","days_after_event":3},{"key":"parting_gift","days_after_event":4},{"key":"newsletter","days_after_event":5},{"key":"referral_ask","days_after_event":14}],"anniversary_wishes":true}'::jsonb, false, false, 111),
  ('content.rhythm', 'Marketing', 'Weekly content rhythm', 'Posts follow the brand rhythm: Monday problem and solution, Tuesday feature focus, Wednesday testimonial, Thursday planning tips, Friday to Sunday wedding showcases. Nothing is posted without approval.', '{"weekly":{"mon":"Problem/Solution","tue":"Feature Focus","wed":"Testimonial Story","thu":"Planning Tips","fri":"Wedding Showcase","sat":"Wedding Showcase","sun":"Wedding Showcase"},"platforms":["instagram","facebook","youtube","linkedin","x"],"needs_approval":true}'::jsonb, false, false, 140),
  ('ads.reporting', 'Marketing', 'Ads reporting', 'Every Monday the ads report shows spend, cost per enquiry and cost per booking by source. Budget changes are recommendations only, and Prashanth decides.', '{"report_day":"mon","budget_changes_need_owner":true,"platforms":["meta","google"]}'::jsonb, false, false, 141)
on conflict (key) do nothing;

-- Every agent is now built. Switch them on; the autonomy dial stays at 'draft'.
update public.agents set implemented = true, enabled = true;

insert into public.menu_library (cuisine, course, name, is_veg, sort) values
  ('South Indian', 'Welcome drink', 'Panakam', true, 10),
  ('South Indian', 'Starter', 'Mini masala dosa', true, 20),
  ('South Indian', 'Starter', 'Medu vada with coconut chutney', true, 21),
  ('South Indian', 'Main', 'Bisi bele bath', true, 30),
  ('South Indian', 'Main', 'Ghee rice with kurma', true, 31),
  ('South Indian', 'Main', 'Chettinad chicken', false, 32),
  ('South Indian', 'Dessert', 'Mysore pak', true, 40),
  ('South Indian', 'Dessert', 'Elaneer payasam', true, 41),
  ('North Indian', 'Starter', 'Paneer tikka', true, 20),
  ('North Indian', 'Starter', 'Murgh malai kebab', false, 21),
  ('North Indian', 'Main', 'Dal makhani', true, 30),
  ('North Indian', 'Main', 'Butter chicken', false, 31),
  ('North Indian', 'Main', 'Assorted breads', true, 32),
  ('North Indian', 'Dessert', 'Gulab jamun', true, 40),
  ('Continental', 'Starter', 'Bruschetta trio', true, 20),
  ('Continental', 'Main', 'Herb-roasted vegetables with risotto', true, 30),
  ('Continental', 'Main', 'Grilled fish with lemon butter', false, 31),
  ('Continental', 'Dessert', 'Tiramisu', true, 40),
  ('Rajasthani', 'Main', 'Dal baati churma', true, 30),
  ('Rajasthani', 'Main', 'Gatte ki sabzi', true, 31),
  ('Rajasthani', 'Main', 'Laal maas', false, 32),
  ('Rajasthani', 'Dessert', 'Ghevar', true, 40),
  ('Pan-Asian', 'Starter', 'Vegetable dim sum', true, 20),
  ('Pan-Asian', 'Main', 'Thai green curry with jasmine rice', true, 30),
  ('Pan-Asian', 'Main', 'Hakka noodles', true, 31),
  ('Pan-Asian', 'Dessert', 'Mango sticky rice', true, 40)
on conflict (cuisine, course, name) do nothing;
