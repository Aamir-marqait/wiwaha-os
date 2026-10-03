# Wiwaha OS — Product Requirements

Oct 1, 2026 · @Sid Rao

Wiwaha OS runs every wedding at Wiwaha by Praman through three verticals (Sales & Marketing, Event Management & CRM, Operations) worked by a team of AI agents, with Prashanth and a small human crew approving the decisions that matter and a client portal where couples choose when each stage begins.

## 1. Goals and success metrics

The OS succeeds if Wiwaha books more weddings, delivers them with fewer misses, and needs Prashanth only for decisions, not chasing. Targets below are proposals to confirm with Prashanth once baselines are measured in Phase 1.

| Goal | Metric | Proposed target |
| --- | --- | --- |
| Never miss an enquiry | Share of calls and messages answered | 100%, 24x7 |
| Respond fast | Time to first reply on any channel | Under 2 minutes |
| Fill the calendar | Enquiry → site visit → booking conversion | Baseline + 30% in 12 months |
| Get paid on time | Payments received by milestone date (10/40/50) | 95% |
| Flawless execution | Checklist items closed on time per wedding | 98% |
| Free up the team | Staff hours spent on admin per wedding | Down 60% |
| Turn couples into advocates | Reviews and referrals per wedding | 1 review + 1 referral lead |
| Know the profit | Weddings with a full cost and margin report | 100% |

## 2. Users, roles and the operating model

Agents do the work; humans own the relationship, the property and the final yes. Every agent reports to one orchestrator, the Chief of Staff agent, which reports to Prashanth.

| User | What they do in the OS | Access |
| --- | --- | --- |
| Prashanth (founder) | Approves pricing exceptions, discounts, contracts and final designs. Reads the daily brief. | Everything, including margins |
| Sales executive | Runs site visits and family meetings; picks up hot leads the agents hand over. | Leads, calendar, visit notes, price book |
| Event manager | Owns each wedding from booking to handover; signs off checklists. | Weddings assigned to them, vendors, run-of-show |
| Estate & housekeeping staff | Complete tasks on phone with photo proof. | Their task list only |
| Accounts | Reviews invoices, GST and reconciliations agents prepare. | Payments, invoices, costs |
| Couple and family (client) | Choose when each planning stage starts; fill briefs; approve moodboards, menus, quotes. | Their own wedding portal |
| Planner or vendor | Receives briefs, confirms dates, uploads deliverables. | Assigned events, limited fields |
| Agents | Do the routine work across all three verticals (see section 8). | Scoped tools per agent, full audit log |

Two house rules from Prashanth shape every agent: be completely honest, and never make a commitment that isn't in the policy book.

## 3. The wedding lifecycle

Every wedding moves through ten stages. Each stage belongs to one vertical and creates a "Wedding Room": one record holding every message, file, task and payment for that couple.

1. **Enquiry** (Sales & Marketing) — call, Instagram, Google/Meta ads, WedMeGood or website. Agents answer availability, capacity and rooms instantly.
2. **Site visit** (Sales & Marketing) — booked by agents, hosted in person by a uniformed executive with refreshments and the brochure.
3. **Follow-up** (Sales & Marketing) — one call two days after the visit; no further calls if there is no response. Repeat family visits are logged on the same lead.
4. **Booking** (Event Management & CRM) — 10% deposit holds the date; contract issued; 40% within two weeks signs it. A WhatsApp group is created with key family contacts and management.
5. **Onboarding** (Event Management & CRM) — welcome letter, portal link and login sent by WhatsApp and email.
6. **Planning** (Event Management & CRM) — from about T-90 days, or earlier if the client starts it: brief, ceremonies, menus, décor moodboards, quote, vendor lock-in.
7. **Final payment** (Ops) — 50% due T-30 days.
8. **Execution** (Ops) — T-minus checklists, daily stand-ups, rooms, run-of-show, event days.
9. **Close-out** (Ops) — handover inspection, final invoice and pending GST, cost and margin report.
10. **Offboarding** (Ops) — personalised review form, thank-you note, parting gift, newsletter list, referral ask.

## 4. Vertical 1: Sales & Marketing

This vertical turns attention into site visits. Agents handle every first touch; humans handle every visit.

### 4.1 Voice agent ("Wiwaha Concierge")

- Answers every call to the Wiwaha number 24x7, in English, Kannada, Hindi, Tamil and Telugu.
- Answers from live data: date availability, capacity per space, room count, catering options, distance from the airport.
- **Price policy:** does not quote prices on the phone; invites the caller to visit. If the caller is outside Bengaluru (asks city or pincode), it may share the approved "starting from" band and send the brochure and video tour on WhatsApp.
- Books the site visit into the sales calendar and sends a WhatsApp confirmation with location pin.
- Places the single follow-up call two days after a visit, logs the outcome, and stops if there's no response.
- Hands over to a human instantly when asked, when the caller is upset, or when a question is outside the policy book.
- Every call is recorded, transcribed, summarised and attached to the lead.

### 4.2 Lead desk

- One inbox for Instagram DMs, WhatsApp, Google and Meta lead forms, WedMeGood and the website.
- De-duplicates people across channels; tags source for ROI.
- Scores each lead (date fit, guest count, budget signal, source; WedMeGood weighted highest) and alerts sales on hot leads.
- Soft holds: a date can be held for a set number of days without payment; the agent auto-releases and tells the client.

### 4.3 Site visit kit

- Pre-visit brief for the executive: who is coming, their date, guest count, what they asked about.
- Visit checklist: uniform, refreshments ready, space dressed, brochure printed.
- Post-visit notes captured by voice on the executive's phone.

### 4.4 Marketing

- Content agent drafts posts per the brand persona's weekly rhythm (Mon problem/solution, Tue feature, Wed testimonial, Thu tips, Fri–Sun showcases) for Instagram, Facebook, YouTube, LinkedIn and X; posts after approval.
- Ads agent monitors Google and Meta spend, cost per enquiry and cost per visit; proposes budget shifts weekly.
- Listings agent keeps WedMeGood and Google Business profiles current and replies to reviews.
- Reputation agent sends the personalised review form by email after each event and routes low scores to Prashanth within 2 hours.

## 5. Vertical 2: Event Management & CRM

This vertical turns a booking into a fully designed, quoted and vendor-locked wedding, with the couple choosing the pace through the portal.

### 5.1 Booking and contract

- Contract generated from the plain black-and-white template with the couple's names, dates, spaces, rooms and terms; e-signature.
- Payment schedule created automatically: 10% deposit, 40% within two weeks (signs the contract), 50% at T-30. UPI and payment links on each milestone with reminders at T-7, T-3 and due day.
- WhatsApp group created with key family contacts and management; the Wedding Room agent sits in it to log decisions and answer routine questions.

### 5.2 Onboarding

- On payment, the system issues the welcome letter and unique logins for each stakeholder (couple, parents, planner).
- Every edit in the portal is logged with user, time and IP address.

### 5.3 Brief and menus

- Guided template: ceremonies (haldi, mehendi, sangeet, wedding, reception), guest counts per function, timings, rituals that affect setup.
- Menu builder with South Indian, Continental, Rajasthani and other cuisines; or flag "outside caterer" with the applicable rules.

### 5.4 Décor and design

- Décor is delivered only by the in-house team or a designated planner; the venue supplies infrastructure (power, complimentary rooms).
- Design agent generates about five AI moodboards per function from the brief: broad themes first, then narrowed detail. Standard (catalogue) and custom designs are labelled clearly.
- Couple shortlists in the portal; the décor lead finalises; Prashanth approves custom work.

### 5.5 Quote and vendor lock-in

- Quote agent prices the finalised brief, menus and décor from the price book; anything off-book goes to Prashanth.
- On the couple's sign-off, the vendor agent emails predefined vendors to lock dates and tracks confirmations.

### 5.6 CRM

- One timeline per family: calls, visits, messages, payments, decisions, files.
- After the wedding: anniversary wishes, referral tracking, repeat events (baby shower, anniversaries, family functions).

## 6. Vertical 3: Operations & Project Management

This vertical makes sure every promise is delivered on time and every rupee is accounted for, across weddings and the estate itself.

### 6.1 Wedding project plans

- When planning starts, the planner agent generates a T-minus plan (T-90, T-60, T-30, T-14, T-7, T-1, event days, T+1) from master templates, assigned to named people.
- Tasks carry owner, due date, priority and proof (photo, file or tick).
- Run-of-show per function, shared with staff and vendors.

### 6.2 Daily rhythm

- **Morning brief (8:30 am):** the stand-up agent sends each person their tasks, overdue items and high-priority flags; Prashanth gets a one-screen summary across all weddings.
- **Evening review (7 pm):** what closed, what slipped, what needs a decision tomorrow.
- Escalation: any task overdue past its buffer alerts the event manager, then Prashanth.

### 6.3 Rooms and guests

- Room inventory (30 rooms now, 60 after expansion) with complimentary allocation per booking; rooming list collected in the portal; check-in and housekeeping schedule.
- Guest logistics: airport pickups, parking, welcome desk.

### 6.4 Estate operations

- Recurring maintenance (garden, pool, AC, generator, pest control) scheduled and tracked.
- Inventory of furniture, linen, crockery and consumables; low-stock alerts.
- Utility and diesel readings logged per event for true cost.

### 6.5 Close-out and finance

- Handover inspection and damage check with photos.
- Automated final invoice, pending GST invoices and payment reports after the event.
- Per-wedding profit report: revenue minus staff, utilities, diesel, F&B and other costs.
- Offboarding sequence: thank-you note, parting gift (chocolates or an Amazon voucher), newsletter list, review form.

## 7. Client portal: the couple sets the pace

The portal shows the couple their journey as a set of stage cards. Each card has a recommended start date, but the couple presses **Start** whenever they're ready; starting a card wakes the agents for that stage and creates its tasks in Ops.

| Stage card | Recommended start | Unlocks after | What starting it triggers |
| --- | --- | --- | --- |
| Our wedding (brief) | On booking | 10% deposit | Brief agent guides the form; event manager assigned |
| Ceremonies & schedule | T-120 | Brief started | Run-of-show draft |
| Menus & tasting | T-90 | 40% paid | Menu options; tasting slot booking |
| Décor & moodboards | T-90 | 40% paid | \~5 AI moodboards per function |
| Guests & rooms | T-60 | 40% paid | Rooming list, pickup schedule |
| Vendors | After décor and menu final | Quote approved | Vendor lock-in emails |
| Final payment | T-30 | Quote approved | Invoice and payment link |
| Memories | T+3 | Event complete | Photo sharing, review form, thank-you |

**Rules**

- A card can start early but never skip its unlock condition (e.g. décor can't start before the 40% contract payment).
- If a card hasn't started by its recommended date, the portal nudges once, then the event manager calls. The couple can snooze with a reason.
- Each card shows status (not started, in progress, awaiting your approval, done), who's working on it, and what's needed from the couple.
- Parents and the planner get their own logins with permissions the couple chooses.
- A chat assistant in the portal answers questions from the policy book and the couple's own Wedding Room, and hands off to a human when unsure.
- Mobile-first, works in English with Hindi and Kannada options.

## 8. The agent roster

Twenty-one agents run Wiwaha, grouped by vertical under one orchestrator. Each has a narrow job, a fixed set of tools, and a clear point where a human must say yes.

| Agent | Vertical | Job | Key tools | Human gate |
| --- | --- | --- | --- | --- |
| Chief of Staff | All | Routes work between agents, writes Prashanth's daily brief, watches SLAs | All read access, task queue | Prashanth sets priorities |
| Voice Concierge | Sales & Marketing | Answers and makes calls, books visits, one follow-up call | Telephony, calendar, policy book | Live handover on request |
| Lead Desk | Sales & Marketing | Unifies inbound channels, de-dupes, scores, replies | WhatsApp, Instagram, WedMeGood, ad lead forms | Hot leads to sales exec |
| Visit Host | Sales & Marketing | Pre-visit brief, visit checklist, post-visit recap | Calendar, CRM | Executive runs the visit |
| Content Studio | Sales & Marketing | Drafts posts, reels scripts, captions per weekly rhythm | Media library, image/video generation, social schedulers | Approve before posting |
| Ads Analyst | Sales & Marketing | Tracks spend, cost per enquiry and per booking; proposes shifts | Google Ads, Meta Ads | Budget changes approved |
| Reputation | Sales & Marketing | Review forms, Google/WedMeGood replies, testimonial capture | Email, listings | Low scores to Prashanth |
| Wedding Room | Event & CRM | Lives in each WhatsApp group and portal; logs decisions, answers routine questions | WhatsApp, Wedding Room record | Escalates anything off-policy |
| Onboarding | Event & CRM | Welcome letter, logins, portal walkthrough | Email, WhatsApp, auth | None |
| Contract & Payments | Event & CRM | Contract generation, 10/40/50 schedule, reminders, receipts | E-sign, payment gateway | Prashanth signs contracts |
| Brief | Event & CRM | Guides the couple through ceremonies, guests, rituals | Portal forms | Event manager reviews |
| Design | Event & CRM | \~5 moodboards per function, refines on feedback | Image generation, décor catalogue | Décor lead finalises; Prashanth for custom |
| Menu | Event & CRM | Menu options by cuisine, tasting booking, plate counts | Menu library, calendar | Chef confirms |
| Quote | Event & CRM | Prices brief + décor + menu from price book | Price book | Off-book items to Prashanth |
| Vendor Coordinator | Event & CRM | Locks vendor dates, sends briefs, tracks confirmations, scores vendors | Email, WhatsApp, vendor DB | Vendor payments approved |
| Planner | Ops | Builds T-minus plan and run-of-show from templates | Task engine, templates | Event manager signs off |
| Stand-up | Ops | 8:30 am and 7 pm briefs, chases overdue tasks | Task engine, WhatsApp | Escalates to manager |
| Rooms & Guests | Ops | Room allocation, rooming lists, pickups, housekeeping schedule | Room inventory | Front desk confirms |
| Estate | Ops | Maintenance schedule, inventory, utility readings | Task engine, inventory | Purchases over limit approved |
| Finance | Ops | Final invoices, GST, reconciliation, per-wedding profit | Accounting export, payment gateway | Accounts reviews |
| Offboarding | Ops | Thank-you, gift order, newsletter, referral ask, anniversaries | Email, gift vendor, CRM | Gift budget approved once |

## 9. Guardrails and human approvals

Agents can act freely on routine work, but anything that commits money, a date, a design or the brand waits for a named human.

- **Policy book as the single source of truth.** Prices, holds, refunds, décor rules, catering rules, timings and house rules live in one editable policy book. Agents answer only from it; anything else is escalated, never improvised.
- **No false commitments.** Agents may not promise discounts, dates, inclusions or outcomes not in the policy book. Every client-facing message is logged and reviewable.
- **Approval queue.** One screen for Prashanth: contracts, discounts, off-book quote lines, custom décor, vendor payments, ad budget changes, purchases above the limit. Approve, edit or reject from the phone.
- **Tiered autonomy.** Each agent starts in "draft" mode (human approves every output), moves to "act and notify", then "act silently" once its error rate is proven low. Prashanth controls the dial per agent.
- **Audit trail.** Every agent action and every portal edit records who, what, when and IP address.
- **Privacy.** Client phone numbers, IDs and payment details are encrypted; only roles that need them can see them; exports are logged.
- **Kill switch.** Prashanth can pause any agent instantly; work falls back to a human queue.

## 10. Data model

The Wedding is the centre of the model; almost everything else hangs off it.

| Entity | Key fields | Links to |
| --- | --- | --- |
| Lead | name, phone, source, date wanted, guest count, score, status, hold expiry | Contacts, Visits, Calls |
| Contact | name, phone, email, role (bride, groom, parent, planner), consent flags | Lead, Wedding |
| Visit | date, executive, attendees, notes, follow-up outcome | Lead |
| Call | recording, transcript, summary, agent or human, outcome | Lead or Wedding |
| Wedding | couple, dates, spaces, functions, guest count, stage, event manager | Contacts, everything below |
| Stage | name, recommended start, unlock rule, started at, status | Wedding |
| Function | type (haldi, sangeet…), date, time, space, guests | Wedding, Menu, Moodboard |
| Moodboard | images, theme, standard or custom, status | Function |
| Menu | cuisine, items, per-plate price, plate count, tasting date | Function |
| Quote / Contract | line items, taxes, total, version, signed at | Wedding |
| Payment | milestone (10/40/50), amount, due, paid, method, receipt | Wedding |
| Vendor | category, contacts, rates, rating, commission | Vendor bookings |
| Task | title, owner, due, priority, proof, T-minus offset, status | Wedding or Estate |
| Room | type, capacity, status | Room allocations |
| Space | name, indoor/outdoor, capacity | Functions, calendar |
| Inventory item | category, quantity, location, reorder level | Estate |
| Cost entry | category, amount, event | Wedding |
| Policy | topic, rule text, version, owner | Agents |
| Agent action | agent, action, input, output, approved by, timestamp | Any record |
| Audit log | user, record, change, time, IP | Any record |

## 11. Tech stack and integrations

A proposed stack that Claude Cowork can build and you can host cheaply; each choice is swappable.

| Layer | Proposed choice | Why |
| --- | --- | --- |
| Web app (team dashboard + client portal) | Next.js, mobile-first, hosted on Vercel | One codebase, fast, easy to deploy |
| Database, auth, file storage | Supabase (Postgres, row-level security, storage) | Role-based access for staff, clients and vendors out of the box |
| Agents | Claude via the Claude API and Agent SDK, with tool use; Opus for planning and design reasoning, Sonnet for most agents, Haiku for high-volume triage | Strong reasoning, honest by default, fits the "no false commitments" rule |
| Agent scheduling | Background job queue (e.g. Supabase cron or Inngest) | Morning/evening briefs, reminders, T-minus triggers |
| Voice | Indian telephony provider (e.g. Exotel or Plivo) with real-time speech-to-text and text-to-speech; Claude as the brain | Local numbers, Indian languages, call recording |
| WhatsApp | WhatsApp Business Platform via a BSP (e.g. Gupshup, Interakt) | Templates, groups workflow, reminders |
| Payments | Razorpay (UPI, cards, payment links) | Milestone links and auto-reconciliation |
| E-signature | Digio or Leegality (Aadhaar e-sign) | Valid in India |
| Moodboards and visuals | Image generation model plus Wiwaha's own photo library | On-brand, venue-accurate visuals |
| Accounting | Export to Zoho Books or Tally | GST-ready invoices |
| Marketing | Meta and Google Ads APIs, Instagram Graph API, Google Business Profile, WedMeGood (via email/lead export) | Lead capture and reporting |

Design the dashboard in the brand palette: sage green, warm gold, ivory, deep burgundy.

## 12. Recommendations to optimise Wiwaha

Ten changes that go beyond automating today's process; each is optional and should be agreed with Prashanth.

1. **Muhurat-aware date pricing.** Auspicious and weekend dates sell out first. A demand calendar lets Prashanth price premium dates higher and offer off-peak incentives, without quoting on the phone.
2. **Expiring soft holds.** Let couples hold a date for 72 hours free, then auto-release. It creates urgency honestly and stops dead holds blocking real buyers.
3. **Replace a second call with a gift of value.** Keep the one-call rule, but after the visit send a personalised moodboard of "your wedding at Wiwaha" on the date they asked for. It nudges without pushing.
4. **Video tour for out-of-town families.** Most long-distance callers can't visit easily. A guided video walkthrough plus a live video call slot respects the in-person policy while not losing them.
5. **Source ROI by booking, not by lead.** WedMeGood gives the best leads; the OS should prove it in rupees per booking so ad budget follows bookings.
6. **Vendor scorecards.** Rate every vendor after every event on time, quality and client feedback. Keeps quality high and supports a commission-earning preferred-vendor list.
7. **True cost per wedding.** Log diesel, power, staff hours and breakages per event. Most venues underprice because they never see this.
8. **Fill the off-season.** Agents can market rooms and spaces to corporate offsites, pre-wedding shoots and small functions in quiet months.
9. **The referral loop.** At T+3, send a short highlight reel and a gallery; ask for the review and a referral at the moment of peak happiness.
10. **One Wedding Room per couple.** Today information sits in WhatsApp, email and heads. One shared record ends "who said what" disputes and makes staff interchangeable.

## 13. Build phases

Ship in four phases of roughly three to four weeks each, so Wiwaha sees value from the first month and every agent proves itself in draft mode before acting alone.

| Phase | Scope | Agents switched on | Done when |
| --- | --- | --- | --- |
| 1. Foundation | Data model, auth and roles, policy book, availability calendar (spaces + rooms), lead inbox, team dashboard shell | Chief of Staff, Lead Desk | Every enquiry lands in one place; calendar is the single truth |
| 2. Sales engine | Voice Concierge, visit booking, follow-up, lead scoring, Prashanth's approval queue | Voice Concierge, Visit Host, Reputation | 100% of calls answered; visits booked without staff |
| 3. Wedding Room + portal | Contract & 10/40/50 payments, onboarding, client portal with stage cards, brief, menus, moodboards, quotes, vendor lock-in | Wedding Room, Onboarding, Contract & Payments, Brief, Design, Menu, Quote, Vendor Coordinator | One live wedding run end-to-end through the portal |
| 4. Ops & growth | T-minus plans, stand-ups, rooms, estate, finance, offboarding, marketing agents, profit reports | Planner, Stand-up, Rooms & Guests, Estate, Finance, Offboarding, Content Studio, Ads Analyst | Daily briefs running; per-wedding profit report produced |

**How to build each module in Cowork:** give it this PRD section, the relevant templates from the Drive folder, and the policy book; ask for the data tables first, then the screens, then the agent with its tools and approval gate; test with one past wedding's real data before going live.

## 14. Open questions

- [ ] What "starting from" price band may the voice agent share with long-distance callers, and what counts as long-distance?
- [ ] How long can a date be held before the 10% deposit?
- [ ] Cancellation and refund terms at each payment milestone?
- [ ] Which décor and menus are "standard" (catalogue) versus custom, and their prices?
- [ ] Who are the predefined vendors per category, and how are they paid?
- [ ] Which languages must the voice agent speak on day one?
- [ ] Gift budget per couple and preferred gift options?
- [ ] Access to the Drive templates (folder visible, files not yet shared) and the procedures file.
- [ ] Is Wiwaha OS only for Wiwaha, or a product to license to other venues later? This changes multi-tenant design from day one.
