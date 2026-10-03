import type { PolicyKey, PolicyRecord, PolicyValue } from "./schema";

/**
 * Seed contents of the policy book. The first eleven rules are Prashanth's
 * non-negotiables (handoff §3) and their wording must stay exactly as given.
 * `needs_confirmation` marks values that PRD §14 still lists as open questions.
 *
 * `pnpm --filter @wiwaha/db gen:seed` turns this file into seed SQL.
 */

type Def<K extends PolicyKey> = Omit<PolicyRecord<K>, "version">;

function def<K extends PolicyKey>(
  key: K,
  topic: string,
  title: string,
  rule_text: string,
  value: PolicyValue<K>,
  opts: { client_visible?: boolean; needs_confirmation?: boolean; sort: number },
): Def<K> {
  return {
    key,
    topic,
    title,
    rule_text,
    value,
    client_visible: opts.client_visible ?? false,
    needs_confirmation: opts.needs_confirmation ?? false,
    sort: opts.sort,
  };
}

const RUPEE = 100; // paise
const LAKH = 100_000 * RUPEE;

export const DEFAULT_POLICIES = [
  // --- Non-negotiables (handoff §3) -------------------------------------------
  def(
    "honesty.commitments",
    "House rules",
    "Honesty",
    "Agents never make a commitment that isn't in the policy book. Unknown → escalate to a human.",
    {
      escalate_unknown: true,
      never_promise: ["discounts", "dates not confirmed on the calendar", "inclusions not in the policy book", "outcomes"],
    },
    { client_visible: true, sort: 10 },
  ),
  def(
    "pricing.phone",
    "Sales",
    "Pricing on calls",
    "No prices quoted on the phone; invite the caller to visit. Out-of-town callers may get the approved \"starting from\" band plus the brochure and video tour on WhatsApp.",
    {
      quote_prices_on_phone: false,
      invite_to_visit: true,
      out_of_town_band: { enabled: true, starting_from_paise: null, label: "Starting-from band (awaiting Prashanth's approval)" },
      local_cities: ["Bengaluru", "Bangalore", "Devanahalli", "Yelahanka", "Hebbal", "Hosakote", "Doddaballapur"],
      send_brochure: true,
      send_video_tour: true,
    },
    { needs_confirmation: true, sort: 20 },
  ),
  def(
    "followup.after_visit",
    "Sales",
    "Follow-up",
    "Exactly one follow-up call, two days after a site visit. No response = stop calling.",
    { calls: 1, days_after_visit: 2, stop_if_no_response: true },
    { sort: 30 },
  ),
  def(
    "payments.schedule",
    "Bookings",
    "Payments",
    "10% deposit holds the date; 40% within two weeks signs the contract; 50% due 30 days before the event.",
    {
      milestones: [
        { milestone: "deposit", label: "10% deposit — holds your date", percent_bps: 1000, due: "on_booking", effect: "holds_date" },
        { milestone: "contract", label: "40% — signs the contract", percent_bps: 4000, due: "days_after_booking", days: 14, effect: "signs_contract" },
        { milestone: "final", label: "50% — final payment", percent_bps: 5000, due: "days_before_event", days: 30, effect: "final" },
      ],
      reminder_offsets_days: [7, 3, 0],
    },
    { client_visible: true, sort: 40 },
  ),
  def(
    "contract.template",
    "Bookings",
    "Contract",
    "Plain black-and-white template; e-signature.",
    { style: "plain_black_and_white", esign: true, signer_for_venue: "Prashanth" },
    { client_visible: true, sort: 50 },
  ),
  def(
    "decor.providers",
    "Planning",
    "Décor",
    "Only the in-house team or a designated planner. Venue provides infrastructure (power, complimentary rooms).",
    { allowed: ["in_house", "designated_planner"], venue_provides: ["power", "complimentary rooms"], requires_payment_unlock: "contract_paid" },
    { client_visible: true, sort: 60 },
  ),
  def(
    "moodboards",
    "Planning",
    "Moodboards",
    "About five per function, broad themes first, then detail. Standard and custom labelled clearly.",
    { per_function: 5, sequence: ["broad", "detail"], label_standard_vs_custom: true, custom_needs_owner_approval: true },
    { client_visible: true, sort: 70 },
  ),
  def(
    "planning.start",
    "Planning",
    "Planning start",
    "Recommended ~90 days before; the couple can start any stage earlier, but never before its payment unlock.",
    { recommended_days_before: 90, allow_early_start: true, respect_payment_unlock: true },
    { client_visible: true, sort: 80 },
  ),
  def(
    "audit.portal_edits",
    "Compliance",
    "Audit",
    "Every portal edit logs user, time and IP address.",
    { log_user: true, log_time: true, log_ip: true },
    { sort: 90 },
  ),
  def(
    "reviews.after_event",
    "After the wedding",
    "Reviews",
    "Personalised review form by email after each event; low scores reach Prashanth within 2 hours.",
    { channel: "email", personalised: true, send_days_after_event: 3, low_score_threshold: 3, escalate_to_role: "owner", escalate_within_hours: 2 },
    { sort: 100 },
  ),
  def(
    "farewell",
    "After the wedding",
    "Farewell",
    "Thank-you note, parting gift (chocolates or an Amazon voucher), added to the newsletter.",
    { thank_you_note: true, gift_options: ["chocolates", "amazon_voucher"], gift_budget_paise: null, add_to_newsletter: true, referral_ask: true },
    { needs_confirmation: true, sort: 110 },
  ),

  // --- Operating parameters (derived from the PRD; editable) ------------------
  def(
    "discounts",
    "Sales",
    "Discounts",
    "Agents never offer or promise a discount. Any discount request goes to Prashanth for a decision.",
    { agents_may_offer: false, approver_role: "owner" },
    { sort: 25 },
  ),
  def(
    "holds.soft_hold",
    "Sales",
    "Soft holds",
    "A date can be held for 72 hours without payment. The hold releases automatically when it expires and the family is told.",
    { hours: 72, auto_release: true, notify_client_on_release: true },
    { client_visible: true, needs_confirmation: true, sort: 35 },
  ),
  def(
    "portal.stage_cards",
    "Planning",
    "Portal stage cards",
    "Each planning stage has a recommended start date. The couple can press Start early, but a stage never opens before its unlock condition. If a stage hasn't started by its recommended date, the portal nudges once, then the event manager calls.",
    {
      cards: [
        { key: "brief", name: "Our wedding (brief)", unlock: "deposit_paid", recommended_label: "On booking", triggers: "Brief agent guides the form; event manager assigned", needs_from_client: "Tell us about your functions, guests and rituals" },
        { key: "ceremonies", name: "Ceremonies & schedule", unlock: "brief_started", recommended_days_before: 120, recommended_label: "120 days before", triggers: "Run-of-show draft", needs_from_client: "Confirm ceremony timings" },
        { key: "menus", name: "Menus & tasting", unlock: "contract_paid", recommended_days_before: 90, recommended_label: "90 days before", triggers: "Menu options; tasting slot booking", needs_from_client: "Pick cuisines and book a tasting" },
        { key: "decor", name: "Décor & moodboards", unlock: "contract_paid", recommended_days_before: 90, recommended_label: "90 days before", triggers: "About five moodboards per function", needs_from_client: "Shortlist your favourite moodboards" },
        { key: "guests_rooms", name: "Guests & rooms", unlock: "contract_paid", recommended_days_before: 60, recommended_label: "60 days before", triggers: "Rooming list, pickup schedule", needs_from_client: "Share your rooming list and arrivals" },
        { key: "vendors", name: "Vendors", unlock: "quote_approved", recommended_days_before: 75, recommended_label: "After décor and menu are final", triggers: "Vendor lock-in emails", needs_from_client: "Approve your quote" },
        { key: "final_payment", name: "Final payment", unlock: "quote_approved", recommended_days_before: 30, recommended_label: "30 days before", triggers: "Invoice and payment link", needs_from_client: "Complete the final 50%" },
        { key: "memories", name: "Memories", unlock: "event_complete", recommended_days_after: 3, recommended_label: "3 days after", triggers: "Photo sharing, review form, thank-you", needs_from_client: "Share your photos and tell us how we did" },
      ],
      nudge_once_then_call: true,
    },
    { client_visible: true, sort: 85 },
  ),
  def(
    "lead_scoring",
    "Sales",
    "Lead scoring",
    "Leads are scored 0–100 on date fit, guest count, budget signal and source. WedMeGood is weighted highest. Hot leads go straight to the sales executive.",
    {
      weights: { date_fit: 35, guest_fit: 20, budget: 20, source: 25 },
      source_scores: {
        wedmegood: 1, referral: 0.9, walk_in: 0.8, website: 0.7, phone: 0.7, google_ads: 0.6, google_form: 0.6,
        instagram: 0.6, whatsapp: 0.6, manual: 0.6, meta_form: 0.5, facebook: 0.5, other: 0.4,
      },
      ideal_guests: { min: 150, max: 300 },
      max_guests: 800,
      budget_bands_paise: { low: 15 * LAKH, good: 30 * LAKH, premium: 50 * LAKH },
      hot_threshold: 85,
    },
    { sort: 36 },
  ),
  def(
    "venue.facts",
    "About Wiwaha",
    "Venue facts",
    "Wiwaha by Praman is a private 4-acre estate 15 km from Bengaluru airport with 30 guest rooms (expanding to 60), complimentary with a booking. Catering is in-house, or the family may bring their own caterer under the outside-caterer rules.",
    {
      estate_acres: 4,
      rooms_now: 30,
      rooms_planned: 60,
      airport_distance_km: 15,
      complimentary_rooms_with_booking: true,
      catering: ["South Indian", "North Indian", "Continental", "Rajasthani", "Pan-Asian"],
      outside_caterer_allowed: true,
    },
    { client_visible: true, sort: 5 },
  ),
  def(
    "visits.checklist",
    "Sales",
    "Site visit checklist",
    "Every site visit is hosted in person by a uniformed executive, with refreshments ready, the space dressed and the brochure printed.",
    {
      items: [
        { key: "uniform", label: "Executive in uniform" },
        { key: "refreshments", label: "Refreshments ready" },
        { key: "space_dressed", label: "Space dressed" },
        { key: "brochure", label: "Brochure printed" },
      ],
      hosted_by: "sales executive",
    },
    { sort: 32 },
  ),
  def(
    "briefs.schedule",
    "Operations",
    "Daily briefs",
    "The morning brief goes out at 8:30 am and the evening review at 7 pm, India time.",
    { timezone: "Asia/Kolkata", morning: "08:30", evening: "19:00" },
    { sort: 120 },
  ),
  def(
    "languages",
    "About Wiwaha",
    "Languages",
    "The portal works in English with Hindi and Kannada options. The voice concierge also speaks Tamil and Telugu.",
    { portal: ["en", "kn", "hi"], voice: ["en", "kn", "hi", "ta", "te"] },
    { needs_confirmation: true, sort: 130 },
  ),

  // ---- Phase 2: sales engine ------------------------------------------------
  def(
    "channels.replies",
    "Sales",
    "Replies and hot-lead alerts",
    "Agents reply on the same channel the enquiry came in on (WhatsApp, Instagram, email or website chat). Hot leads are sent to the sales executive on WhatsApp straight away.",
    { reply_on_same_channel: true, fallback_channel: "whatsapp", hot_lead_alert_channel: "whatsapp", hot_lead_alert_role: "sales", website_chat_enabled: true },
    { sort: 37 },
  ),
  def(
    "visits.booking",
    "Sales",
    "Booking site visits",
    "Site visits are booked in 90-minute slots between 10 am and 6 pm, any day of the week, at least 4 hours ahead. The family gets a WhatsApp confirmation with the location pin and a reminder the day before.",
    { slot_minutes: 90, open_from: "10:00", open_until: "18:00", days_open: [0, 1, 2, 3, 4, 5, 6], lead_time_hours: 4, reminder_hours_before: 24, confirmation_channel: "whatsapp", location_name: "Wiwaha by Praman, near Devanahalli (15 km from Bengaluru airport)", location_pin_url: null },
    { needs_confirmation: true, sort: 31 },
  ),
  def(
    "voice.concierge",
    "Sales",
    "Phone concierge",
    "Every call is answered 24x7 and recorded (the caller is told). The concierge hands the call to the sales team when the caller asks for a person, is upset, or asks something outside the policy book. If nobody picks up, it promises a callback within 30 minutes and creates an urgent task.",
    { hours: "24x7", record_calls: true, announce_recording: true, transfer_to_role: "sales", transfer_number_e164: null, callback_within_minutes: 30, transfer_on: ["asked_for_person", "upset", "off_policy"] },
    { needs_confirmation: true, sort: 21 },
  ),
  def(
    "reviews.replies",
    "Sales",
    "Replying to reviews",
    "Replies to Google and WedMeGood reviews are drafted for approval before posting. Happy couples (4 or 5 stars) are asked whether we may use their words as a testimonial.",
    { platforms: ["google", "wedmegood"], reply_needs_approval: true, capture_testimonial_min_score: 4 },
    { sort: 101 },
  ),

  // ---- Phase 3: Wedding Room and portal ------------------------------------
  def(
    "contracts.process",
    "Bookings",
    "Contract approval",
    "Prashanth approves every contract before it is sent for e-signature.",
    { owner_approves_before_send: true, esign_provider: "digio", template_version: "standard_bw_v1" },
    { sort: 51 },
  ),
  def(
    "onboarding.welcome",
    "Bookings",
    "Welcome and logins",
    "When the 10% deposit arrives, the couple receives a welcome letter and their portal logins on WhatsApp and email, and a family WhatsApp group is set up with the key family contacts and our management.",
    { trigger: "deposit_paid", channels: ["whatsapp", "email"], whatsapp_group_members: ["couple", "parent", "owner", "event_manager"] },
    { client_visible: true, sort: 52 },
  ),
  def(
    "portal.nudges",
    "Planning",
    "Portal reminders",
    "If a planning stage hasn't started by its recommended date, the portal sends one gentle reminder; three days later the event manager calls. The couple can snooze a stage for up to 30 days with a reason.",
    { nudge_days_after_recommended: 0, call_task_days_after_nudge: 3, snooze_max_days: 30 },
    { client_visible: true, sort: 86 },
  ),
  def(
    "menus.rules",
    "Planning",
    "Menus and catering",
    "Menus can be South Indian, North Indian, Continental, Rajasthani or Pan-Asian, or the family may bring an outside caterer. Tastings are booked at least 7 days ahead, and plate counts lock 14 days before the event.",
    { cuisines: ["South Indian", "North Indian", "Continental", "Rajasthani", "Pan-Asian"], outside_caterer_rules: "Outside caterers work from the service kitchen, bring their own staff and equipment, and follow the estate's safety and clean-up rules.", tasting_lead_days: 7, plate_count_lock_days_before: 14 },
    { client_visible: true, needs_confirmation: true, sort: 87 },
  ),
  def(
    "quotes.rules",
    "Planning",
    "Quotes",
    "Quotes are priced only from the price book and stay valid for 30 days. Any line not in the price book, and any custom décor, waits for Prashanth's approval before the couple sees the quote.",
    { validity_days: 30, off_book_needs_owner: true, custom_decor_needs_owner: true },
    { sort: 88 },
  ),
  def(
    "vendors.lockin",
    "Planning",
    "Vendor lock-in",
    "Once the couple approves the quote, our preferred vendors are asked to confirm the dates. Vendors who haven't replied are chased every 48 hours, up to three times, then the event manager steps in.",
    { chase_after_hours: 48, max_chases: 3, escalate_after_chases: true },
    { sort: 89 },
  ),

  // ---- Phase 4: operations and growth --------------------------------------
  def(
    "tasks.escalation",
    "Operations",
    "Overdue tasks",
    "A task still open after its buffer goes to the event manager; if it is still open 24 hours later it goes to Prashanth.",
    { to_event_manager_after_buffer: true, to_owner_after_hours: 24 },
    { sort: 121 },
  ),
  def(
    "rooms.operations",
    "Operations",
    "Rooms and guests",
    "Check-in is from 2 pm and check-out by 11 am. Housekeeping allows 45 minutes per room between guests. Airport pickups run from Bengaluru T1 and T2.",
    { check_in_time: "14:00", check_out_time: "11:00", housekeeping_minutes_per_room: 45, pickup_points: ["BLR T1", "BLR T2"] },
    { client_visible: true, needs_confirmation: true, sort: 122 },
  ),
  def(
    "estate.purchases",
    "Operations",
    "Purchases",
    "Purchases above ₹25,000 need Prashanth's approval. Low-stock alerts go to the estate team.",
    { owner_approval_above_paise: 2500000, low_stock_alert_role: "staff" },
    { needs_confirmation: true, sort: 123 },
  ),
  def(
    "finance.gst",
    "Finance",
    "GST and invoices",
    "Invoices show GST per line: venue, décor, AV and services at 18%, rooms at 12% and catering at 5%. Invoices are exported for the accountant as Tally-ready CSV.",
    { rates_bps: { venue: 1800, rooms: 1200, catering: 500, decor: 1800, av: 1800, services: 1800 }, gstin: null, invoice_prefix: "WIW", state_code: "29", export_format: "tally_csv" },
    { needs_confirmation: true, sort: 124 },
  ),
  def(
    "closeout.inspection",
    "Operations",
    "Handover inspection",
    "After every event the estate is inspected with photos. Any damage is recorded, and Prashanth decides on the security deposit.",
    { photo_required: true, security_deposit_paise: null, deposit_decision_role: "owner" },
    { needs_confirmation: true, sort: 125 },
  ),
  def(
    "offboarding.sequence",
    "After the wedding",
    "Farewell sequence",
    "Three days after the event the couple gets a thank-you note, their photo-sharing link and the review form; the parting gift follows the next day, the newsletter invitation after that, and a referral ask two weeks later. We send anniversary wishes every year.",
    { steps: [ { key: "thank_you", days_after_event: 3 }, { key: "photo_sharing", days_after_event: 3 }, { key: "review_form", days_after_event: 3 }, { key: "parting_gift", days_after_event: 4 }, { key: "newsletter", days_after_event: 5 }, { key: "referral_ask", days_after_event: 14 } ], anniversary_wishes: true },
    { sort: 111 },
  ),
  def(
    "content.rhythm",
    "Marketing",
    "Weekly content rhythm",
    "Posts follow the brand rhythm: Monday problem and solution, Tuesday feature focus, Wednesday testimonial, Thursday planning tips, Friday to Sunday wedding showcases. Nothing is posted without approval.",
    { weekly: { mon: "Problem/Solution", tue: "Feature Focus", wed: "Testimonial Story", thu: "Planning Tips", fri: "Wedding Showcase", sat: "Wedding Showcase", sun: "Wedding Showcase" }, platforms: ["instagram", "facebook", "youtube", "linkedin", "x"], needs_approval: true },
    { sort: 140 },
  ),
  def(
    "ads.reporting",
    "Marketing",
    "Ads reporting",
    "Every Monday the ads report shows spend, cost per enquiry and cost per booking by source. Budget changes are recommendations only, and Prashanth decides.",
    { report_day: "mon", budget_changes_need_owner: true, platforms: ["meta", "google"] },
    { sort: 141 },
  ),
] as const satisfies readonly Def<PolicyKey>[];

export const NON_NEGOTIABLE_KEYS: readonly PolicyKey[] = [
  "honesty.commitments",
  "pricing.phone",
  "followup.after_visit",
  "payments.schedule",
  "contract.template",
  "decor.providers",
  "moodboards",
  "planning.start",
  "audit.portal_edits",
  "reviews.after_event",
  "farewell",
];
