# Decisions log

Each entry records what was decided, why, and what would make us revisit it. Newest at the bottom.

## D1 — pnpm monorepo, single Next.js app for team + portal (2026-10-03)
**Decision:** One Next.js App Router app (`apps/web`) serving `/team` and `/portal`; shared packages for db, policy, agents, integrations, ui.
**Why:** Handoff §4. One deploy, one auth system, shared components. pnpm workspaces are already installed in the dev environment and need no extra tooling (no Turborepo yet).
**Revisit if:** portal needs its own domain with different scaling or caching — split via Next.js multi-zones.

## D2 — Single-tenant schema for now (2026-10-03)
**Decision:** No `venue_id` column; the database is Wiwaha's alone.
**Why:** PRD §14 leaves licensing open. Adding tenancy everywhere now doubles RLS complexity for an unconfirmed need.
**Revisit if:** Prashanth confirms licensing to other venues. Migration path: add `venue_id` to every table with a default, add it to every RLS predicate. **Flagged as an open question.**

## D3 — RLS via `app.current_role()` helper + `wedding_members` (2026-10-03)
**Decision:** `profiles.role` holds one staff/client/vendor role per user. Policies call `app.has_role(...)`. Clients reach wedding data only through `wedding_members` rows (couple, parents, planner each get their own login and permission set).
**Why:** Simple, auditable, and matches the PRD access table. Agents run server-side with the service role and always log to `agent_actions`, so the `agent` role is reserved for future scoped tokens.

## D4 — Audit by database trigger, IP from PostgREST request headers (2026-10-03)
**Decision:** A generic `app.audit_trigger()` on every user-editable table writes `audit_log` with `auth.uid()`, the changed row diff, and the IP from `current_setting('request.headers')->>'x-forwarded-for'`.
**Why:** Can't be bypassed by a forgetful API route; captures portal edits made directly through supabase-js with RLS.

## D5 — Calendar holds with exclusion constraint (2026-10-03)
**Decision:** `calendar_entries` (space or room, date range, status `enquiry|held|confirmed|released`). A `btree_gist` exclusion constraint prevents two *blocking* entries (`held`, `confirmed`) overlapping on the same space/room. Holds carry `expires_at`; `app.place_hold()` releases expired holds before inserting, and `pg_cron` runs `app.release_expired_holds()` every 15 minutes.
**Why:** The database is the single truth, so double-booking is impossible even under concurrent requests. `enquiry` entries are pencil marks that don't block.
**Default hold length:** 72 hours (PRD §12 recommendation #2) — stored in policy `holds.soft_hold_hours`, **to be confirmed by Prashanth** (PRD §14).

## D6 — Scheduling: Vercel Cron for agent jobs, pg_cron for pure-SQL jobs (2026-10-03)
**Decision:** `vercel.json` schedules `/api/cron/morning-brief` at 03:00 UTC (08:30 IST). Hold expiry is pure SQL so it runs in `pg_cron`. Inngest deferred until Phase 2 needs retries/fan-out.
**Why:** No new paid service; both are included in Vercel/Supabase plans.

## D7 — Agents: thin in-house framework on the Claude API, deterministic fallbacks (2026-10-03)
**Decision:** `packages/agents/src/framework` wraps `@anthropic-ai/sdk` `messages.create`. Every run: check `enabled` (kill switch) → load policy book → compute → guardrail check → gate (draft ⇒ approval) → log `agent_actions`. If `ANTHROPIC_API_KEY` is missing, agents use template fallbacks.
**Why:** The Phase 1 agents (scoring, drafting a reply, writing a brief) are single-shot tasks; a full agent loop adds cost and nondeterminism without benefit. Deterministic scoring keeps lead scores explainable and testable. Fallbacks let the app demo and test offline.
**Revisit if:** Phase 2 voice/WhatsApp agents need multi-step tool loops — add the SDK tool runner inside the same framework.

## D8 — Lead scoring is rules-based, weights in the policy book (2026-10-03)
**Decision:** Score 0–100 from date fit (calendar availability), guest count fit, budget signal, and source weight (WedMeGood highest). Weights live in policy `lead_scoring`. Haiku only drafts the reply text.
**Why:** Prashanth can tune weights without code; scores are reproducible.

## D9 — De-duplication by normalised phone (2026-10-03)
**Decision:** Phones normalised to E.164 (`+91XXXXXXXXXX` default). `contacts.phone_e164` is unique; a repeat enquiry attaches a new `lead_touches` row to the open lead instead of creating a duplicate.
**Note:** PRD §9 asks for encrypted phone numbers. Phase 1 relies on Supabase disk encryption + RLS (only roles that need phones can read `contacts`). Column-level encryption with a blind index for dedupe is scheduled for Phase 3 before real client data goes in. **Flagged.**

## D10 — Money in paise, dates in UTC (2026-10-03)
Per handoff §4. Columns are `*_paise bigint`; event days are `date` (no timezone), timestamps are `timestamptz`; UI formats with `Asia/Kolkata`.

## D11 — Phase 1 approvals for lead replies don't send anything (2026-10-03)
**Decision:** Approving a Lead Desk draft marks the message `approved` and logs it on the lead timeline; actual sending via WhatsApp/email arrives with the Phase 2 connectors (`packages/integrations` has the interfaces).
**Why:** Handoff: get Prashanth's written OK before connecting live channels.

## D12 — Model choices per agent (2026-10-03)
Stored in `agents.model`: Lead Desk `claude-haiku-4-5` (triage volume), Chief of Staff `claude-opus-5-5` (reasoning across the business). Owner can change in Settings → Agents. Opus/Sonnet calls set the server-side refusal fallback (`fallbacks: "default"`).

## D13 — Every lead is routed by the Chief of Staff (2026-10-03)
**Decision:** `ingest_lead` triggers an `agent_tasks` row (`new_lead` / `lead_updated`); the Chief of Staff claims it atomically and dispatches to Lead Desk. The web request kicks routing off immediately (`after()`), and the hourly cron catches anything missed.
**Why:** One routing path (handoff: CoS is the only router), no lost leads if a request dies, no double drafts when two runs overlap.

## D14 — The owner's brief isn't gated (2026-10-03)
**Decision:** The 8:30 am brief is delivered straight to Prashanth even in `draft` mode. Gating applies to anything leaving the business or committing money, a date, a design or the brand.
**Why:** Approving your own briefing before reading it is meaningless. Revisit if briefs ever go to staff or clients.

## D15 — Client IP for the audit log (2026-10-03)
**Decision:** Server-side Supabase calls forward the browser IP as `x-client-ip`; the trigger prefers it, then the first `x-forwarded-for` hop. A user calling PostgREST directly could spoof `x-client-ip`, but every row still carries their verified user id.
**Revisit if:** audit IPs need to be evidential. Then route all portal writes through server actions and ignore client-supplied headers.

## D16 — Deferred to later phases (2026-10-03)
Portal Hindi/Kannada strings (Phase 3, with the portal build-out), client-portal invites UI (Phase 3 onboarding), column-level PII encryption (before real client data, see D9), outbound sending (Phase 2 connectors; approved messages are recorded with status `approved` until then).

## D17 — Default hot-lead threshold 85 (2026-10-03)
Testing with the seed showed 75 marked nearly every lead hot. 85 keeps "hot" meaningful; tune in policy `lead_scoring`.

## D18 — Staging Supabase project (2026-10-03)
**Decision:** Staging lives in the Supabase project `wiwaha-os-staging` (ref `ytqojvumknmebcsjqzio`, Mumbai `ap-south-1`, org "RohithMarqait's Org", free plan). All ten migrations from `packages/db/supabase/migrations` were applied under the same names, then all three seed files including the demo seed. `pg_cron` is on and `release-expired-holds` runs every 15 minutes.
**Consequence:** Migrations have now reached a real project. From here on **only add new migrations**; never edit an applied one.
**Open:** The security advisor warns that 16 functions have a mutable `search_path` (the `public.*` RPC wrappers and a few `app.*` helpers) and that leaked-password protection is off. Neither blocks staging. Fix both in a new migration and in Auth settings before production.

## D19 — Vercel project on the Hobby plan: daily crons only (2026-10-03)
**Decision:** Vercel project `wiwaha-os` (team "Aamir's projects", Hobby), root directory `apps/web`. Hobby only allows crons that run once a day, so the agent-routing sweep `/api/cron/agents` runs daily at 04:30 UTC (10:00 am IST) instead of hourly. The morning brief is unchanged (03:00 UTC).
**Why it's acceptable for staging:** every enquiry is still routed immediately by the web request (`after()`, see D13); the sweep only catches runs that died halfway, so on Hobby a stuck lead can wait up to a day instead of an hour.
**Revisit:** before go-live, upgrade to Vercel Pro and set the sweep back to `30 * * * *`, or schedule it from Supabase `pg_cron`.

## D20 — Décor before the 40% payment is a guardrail, not just a portal lock (2026-10-03)
**Decision:** The handoff requires every agent to be tested against "a décor request before the 40% payment". The portal already locks the décor stage (`app.start_stage` checks `contract_paid`), but an agent could still *offer* moodboards early in a message. Added a hard guardrail flag `unlock_bypass` (framework-wide, in `guardrails.ts`), a Lead Desk `decor_early` intent whose safe reply explains the unlock, and `decorUnlockLabel()` in `@wiwaha/policy` so the wording ("the 40% contract payment") always comes from `decor.providers` + `payments.schedule`, never hard-coded.
**Revisit:** agents that work after booking (Design, Wedding Room) must pass `decorUnlocked: true` to the guardrail once the wedding's contract payment is paid.

## D21 — Pinned search_path on all functions (2026-10-03)
Migration `20261003001100_pin_search_path.sql` clears Supabase advisor lint 0011 on 16 functions (PRD §9 privacy/guardrails). Applied to staging; `pnpm db:test` passes. Remaining advisor warning: leaked-password protection (Auth dashboard toggle).

## D22 — Migrations deploy from CI on merge (2026-10-03)
**Decision:** `.github/workflows/deploy-migrations.yml` applies new migration files to staging on every merge to `claude/phase-1-foundation` or `main`. It uses `packages/db/scripts/deploy-migrations.mjs`, which goes through the Supabase Management API, so the only secret is `SUPABASE_ACCESS_TOKEN` and no database password is needed. Each file runs in one transaction with its `supabase_migrations.schema_migrations` row, applied in filename order, and the run stops at the first failure. Rollback on failure and idempotent reruns were tested against staging.
**Why:** collaborators get only GitHub access. Every schema change goes through a reviewed PR and the local `db:test` gate, and nobody applies SQL to staging by hand.
**Note:** the 11 migrations applied earlier through the Supabase connector were re-keyed in `schema_migrations` to their filename versions, so CI sees them as applied.

## D23 — The 15-minute tick runs from pg_cron through pg_net (2026-10-04)
**Decision:** Vercel Hobby allows only daily crons, so migration `20261004000800_tick_schedule.sql` schedules `wiwaha-agent-tick` (`*/15 * * * *`) in Supabase `pg_cron`. It calls `app.call_tick()`, which reads the app URL and `CRON_SECRET` from Supabase Vault (`wiwaha_app_url`, `wiwaha_cron_secret`) and makes a `pg_net` GET to `/api/cron/tick`. With either secret missing it does nothing. The tick runs every scheduled job (routing, follow-up calls, reminders, nudges, chases, plate locks, stand-ups, escalations, estate, close-outs, offboarding, content, ads) and then sends approved messages. Each job is idempotent and checks its own time of day (8:30 am and 7 pm IST from policy `briefs.schedule`) or weekday.
**Why:** one scheduler and no secrets in SQL. Running a job twice never sends twice: briefs are unique per person per day, weekly jobs claim a `job_runs` row, and reminders record what they sent.

## D24 — Sandbox first for every outside channel (2026-10-04)
**Decision:** `packages/integrations` picks a live adapter only when that channel's keys are set (Gupshup WhatsApp, Resend email, Instagram via Meta, Plivo calls, Razorpay links). Otherwise it uses a sandbox adapter that returns `sbx_…` references. Every send, live or sandbox, is an `outbox` row. Payment links in sandbox open `/pay/sandbox/<payment>`, which marks the payment paid through the same database trigger Razorpay's webhook uses. E-signature has no live adapter yet: `/sign/sandbox/<contract>` stands in until Digio or Leegality is chosen.
**Why:** the handoff says test mode until Prashanth approves going live. The whole flow (booking → contract → 10/40/50 → onboarding → vendors) can be demoed end to end without one rupee or message leaving the building.
**Revisit:** at go-live, set the keys in Vercel. The sandbox pay and sign pages switch themselves off when Razorpay or e-sign keys exist.

## D25 — Agents get a scoped database port, not raw Supabase (2026-10-04)
**Decision:** Phase 2–4 agents talk to the database through `framework/db.ts`: a small `Db` interface (select, insert, update, upsert, rpc) wrapped by `scopeDb()` with the grants in each agent's `tools.ts`. Calling a table or RPC that isn't granted throws `ToolNotAllowedError`. Tests use `MemoryDb`, which mimics the constraints and triggers that matter (unique follow-up call, décor unlock, job_runs).
**Why:** "tools.ts: only the tools this agent may call" is enforced in code, and every agent's scenario tests run in milliseconds without Postgres.

## D26 — Who answers the family (2026-10-04)
**Decision:** The Wedding Room agent answers family messages (WhatsApp group and portal chat) only from the couple's own record (payments, functions, stages) and client-visible policies. Decisions are logged to `wedding_decisions`. Price, discount and anything unknown go to a person. Couples see a message only after it has been sent: an RLS change hides `pending_approval` drafts from them.

## D27 — Portal unlocks enforced in the database (2026-10-04)
**Decision:** Every portal write path checks `app.require_stage_open` (brief, functions, rooming list, menu approval, moodboard shortlist), and a trigger refuses any moodboard insert, even by an agent, before the décor unlock (40% paid). Contracts can't move to `sent` without an approved `contract` approval, and quotes with off-book or custom lines can't be sent without Prashanth's approval.

## D28 — Offline task completion (2026-10-04)
**Decision:** `/team/tasks` keeps a copy of the person's list (localStorage) and a service worker (`public/sw.js`) caches the page. A completion made offline is stored in IndexedDB with its proof photo as a Blob and the time it was ticked. When the phone is back online it uploads the photo to the private `task-proof` bucket and calls `complete_task(p_completed_at)`. The RPC is idempotent (a done task stays done) and records `completed_offline_at`.

## D29 — Templates for plans and run-of-show are data (2026-10-04)
**Decision:** T-minus steps come from `task_templates` (plan `standard_wedding`, with owners by role; the event manager is the wedding's own). Run-of-show items come from `run_of_show_templates` (minutes relative to each function's start, optionally tied to a vendor category). Both tables are editable by the owner and event managers. When the Drive templates arrive, load them into these tables; no code changes.

## D30 — Money after the event (2026-10-04)
**Decision:** The Finance agent re-rates every quote line with GST from policy `finance.gst` (category → rate), splits CGST and SGST for Karnataka (state code 29, otherwise IGST), and issues two invoices (final and GST) as one `invoice` approval. Profit is collected revenue (ex-GST share) minus `cost_entries`. Export to Tally or Zoho Books is a CSV (`/api/finance/export`). The security-deposit decision is proposed from the handover inspection and decided by Prashanth. No agent refunds or charges anything.
**Open:** `closeout.inspection.security_deposit_paise` is empty, so no deposit decision is proposed until Prashanth sets one. `finance.gst.gstin` is empty, so it isn't printed yet.

## D31 — Marketing without live accounts (2026-10-04)
**Decision:** Content Studio drafts next week's posts (5 platforms × 7 days, brand rhythm from `content.rhythm`) as one `social_post` approval per day. Approved posts become `scheduled` with a sandbox `social_post` outbox row, because no publishing API is connected. Ad spend is imported as CSV on `/team/marketing` until the Meta and Google Ads APIs are connected. The weekly ads report is an `ad_budget` approval: a recommendation only, applied by hand in the ads managers.

## D32 — Manual-first fallbacks for every slow connection (2026-10-09)
**Decision:** Anything that needs an outside approval has a manual way to do the same job, so nobody waits on Meta, Google, Razorpay or a WhatsApp provider.
- **WhatsApp and email:** while a provider isn't live, approved messages stay `approved` (not faked as sent) and appear in **To send** (`/team/outbox`). One tap opens WhatsApp (`wa.me`) or the mail app with the text filled in; "I've sent it" records who sent it (`outbox.provider = 'manual'`). Web chat is unaffected. With keys set, `sendApprovedMessages` sends as before.
- **Meta and Google leads:** CSV import (`/team/leads/import`, `parseLeadCsv`) with loose header matching. It goes through the same de-duplicating intake, so re-importing never duplicates.
- **Payments:** accounts record bank, UPI or cheque payments on the wedding page. The same database trigger issues the receipt, signs the contract on the 40% and opens décor.
- **Connections page** (`/team/settings/channels`) lists every dependency with its status, what it needs and the fallback.
- Click-to-call, WhatsApp and email buttons on the lead page.
**Security fix:** the test pay and sign pages could mark a payment paid or a contract signed without any check, and they were reachable on the deployed app. They now exist only when `ALLOW_SANDBOX_LINKS=true` (demos), and without it agents send no test links at all.
**Decided against:** a "Sign in with Claude" login and building Wiwaha OS as a Claude connector (Anthropic doesn't allow third-party apps to use Claude plan logins; see the conversation of 2026-10-06). Revisit a connector later if the team wants to chat with Wiwaha from Claude.

## D33 — Staff add and edit records in the app (2026-10-12)
**Decision:** Everything a person (not an agent) needs to create has a screen:
- **New wedding** (`/team/weddings/new`, owner and sales): goes through the same `ingest_lead` → `mark_lead_booked` path as a booked enquiry, so the date hold, plan and agents start exactly as they would for a lead. A phone number that already has a booked wedding opens that wedding instead of making a duplicate.
- **Wedding page:** add, edit and remove functions; add family contacts (optionally invited to the portal, with permissions by relation).
- **Tasks:** "+ Add task" for any wedding or the estate, and an "Everyone" view.
- **Lists** (`/team/settings/lists`): one spec-driven editor (`lib/catalogue.ts`) for vendors, inventory, maintenance, price book, spaces, rooms, dishes, plan steps and run-of-show steps. Rupees and percentages are converted to paise and basis points on save. Who may edit each list is enforced by RLS, not by the page.
**Open:** complimentary rooms can be set when creating a wedding, but not yet edited afterwards or set from "Mark as booked" on a lead.

## D34 — Headings by department, access per person, payment parts set by Prashanth (2026-10-12)
From the workflow meeting of 2026-10-12 (summary and transcript in the session).
- **Headings:** the team app is grouped as Sales & Marketing, Venue, Weddings, Vendors, Accounts, Client and Admin (`lib/nav.ts`). New pages: **Vendors** (`/team/vendors`) and **Client portal** (`/team/clients`, with one-time sign-in links to share on WhatsApp).
- **Access per person:** `profiles.sections` (null = the role's defaults in `lib/sections.ts`). Prashanth ticks headings per person in Settings → Team & access; a database trigger stops anyone else changing them. Sections decide what's *shown*; RLS still decides what can be *read or changed*, so a section can only be given to roles whose data access fits it (`SECTION_ROLES`).
- **Payment parts:** the standard split stays 10/40/50 in policy `payments.schedule`, now edited as parts (name, %, when due, what it unlocks) instead of raw JSON. Each payment row carries its own `effect` (`holds_date`, `signs_contract`, `final`, `none`), so unlocks, the contract signing and agents follow the part, not its name. Prashanth can give one wedding its own split (`set_payment_parts`, owner only): at booking (New wedding, Mark as booked) or later on the Wedding Room. Paid parts can't change; parts must add up to 100%; the last part takes rounding so amounts always equal the contract value. Contracts with their own split print "each payment is due on or before the date shown" instead of the standard terms.
- **Calendar sync:** a read-only iCalendar feed per space and for all spaces (`/api/calendar/feed`, signed with `CALENDAR_FEED_SECRET`, falling back to an HMAC of the service key). Subscribed from Google Calendar or iCloud; refreshed hourly by them. Two-way sync (editing from Google) is not built: it needs Google OAuth.
- **Logins:** the home page asks "Client login" or "Wiwaha team login"; the two login pages say which they are.

## D35 — Verticals, décor templates, ideas, and planning that opens 90 days before (2026-10-12)
From the same meeting as D34.
- **Planning start (changed rule):** active planning opens 90 days before the event. Policy `planning.start` now has `allow_early_start: false`; `start_stage` refuses a family member before a stage's date ("This opens on …"), while the event manager or Prashanth can still open one early. The seed default, the handoff test and CLAUDE.md's table were updated with this decision; staging gets it as a versioned policy edit with a change note.
- **Ideas wall:** before planning opens the family shares ideas in the portal (`wedding_ideas`); staff mark them "Noted". Ideas posted in the WhatsApp group aren't read by the app (WhatsApp's API can't read groups).
- **WhatsApp group:** still made by the event manager by hand (the API can't reliably create groups). The onboarding task now carries the welcome message to post, and the invite link is saved on the Wedding Room (`weddings.whatsapp_group_url`), which completes the task.
- **Entertainment and Extras** are verticals with their own lists (`service_options`: price to client and our cost, for costing) and stage cards. The event manager sends options to a couple (`wedding_selections`, a snapshot of name, description and photo); the couple can only choose or decline what was sent (`client_choose_selection`), never read the catalogue or its prices; staff make a choice final.
- **Décor templates by area** (`decor_templates`): a photo of the spot as it is, photos of past work, palette, standard or custom. The Design agent builds round-1 moodboards from matching templates first and fills the rest from its built-in themes. Photos live in the public `library` bucket (only owner and event managers upload).
- **Wedding Room by department:** tabs for Overview (with "Where this wedding is", the agreed flow from enquiry to review), Décor, Entertainment, Food & beverage, Venue & rooms, Extras, Vendors, Payments and Family.

## D36 — Costing, work orders, checklists, guest page, portal access window, evening review (2026-10-12)
From the same meeting as D34 and D35.
- **Internal costing:** the quote is Prashanth's costing sheet. Every line now records what the price list prescribed and our cost, in `quote_line_costs`, a table only the owner and accounts can read (the couple can read their quote lines, so costs never sit on them). Final entertainment and extras join the quote, priced from their lists; the quote waits while any option is still with the couple. On the Wedding Room's Payments tab Prashanth sees agreed vs prescribed vs cost and margin per line, changes any price, then approves ("Approve and send to the couple") or sends it back. Approving releases the quote to the couple for their consent, as before. Costs on price lists (`price_book_items.cost_paise`, `service_options.cost_paise`) are visible to staff who can see those lists, never to clients.
- **Work orders:** when the couple approves the quote, each vendor request carries its work order (the approved lines its category delivers, `domain/work-orders.ts`) and our expected cost; the vendor sees it on their reply page and in the email (never client prices).
- **Checklists:** when a vendor accepts, by link or by a phone call recorded by the event manager (both now queue the agent from a database trigger), one task per work-order item goes to the event manager, due two days before its function.
- **Client dashboard:** the portal home groups everything sent to the couple as Waiting for you, You've chosen, and Confirmed (menus, décor, entertainment, extras and the quote).
- **Guest page** (`/g/<token>`, one per wedding, no login): welcome (editable), itinerary, the estate, and add-on services marked "Guests can book" in Lists → Extras. Requests go to the event manager (`guest_requests`, staff-only); nothing is charged online. The link stops working three days after the event.
- **Portal access window:** policy `portal.access` (`close_days_after_event: 0`): family logins stop working after the wedding day (`app.portal_open`, used by membership checks). Staff can keep a portal open longer (Client portal → Keep open 7 more days). After closing, the family sees a thank-you screen. The photo-sharing farewell step becomes a task for the event manager when the portal has closed (it pointed at the portal).
- **Review form on the evening of the last function:** `reviews.after_event` now has `send_days_after_event: 0, send_at: "19:00"`; a scheduled job drafts it once, by email; the T+3 step skips it if it already went. The non-negotiable rule text ("after each event…") is unchanged.

## D37 — Two-part payments, décor management, work orders only we approve, dropdown sidebar, links (2026-10-12)
Founders' follow-up the same day.
- **Payments (changed rule):** the standard split is two parts: a 50% advance on booking holds the date and signs the contract (new effect `books`, which counts as both `holds_date` and `signs_contract` everywhere), and 50% is due 30 days before the event. Prashanth can change the standard split or any wedding's own parts (D34). Seed, handoff test and CLAUDE.md updated; staging gets a versioned policy edit, and only new bookings use it (existing weddings keep their parts).
- **Décor management** is its own heading: *Stock* (each piece photographed, with name, type, quantity, condition and where it's stored; phone camera works), *Templates by area* (the D35 templates, grouped by area), and *Assigned to events* (piece → wedding, optional function, area, quantity; set up → returned with its condition, which updates the piece). The database refuses to promise more of a piece than we own on overlapping dates. The wedding's Décor tab shows the stock assigned to it. Estate staff can manage stock and upload photos.
- **Work orders are approved by us only:** the Vendor Coordinator drafts each work order and alerts the event manager; nothing reaches a vendor until Prashanth or an event manager approves it (`approve_work_order`), whatever the agent's autonomy dial. Approved emails wait in To send while email isn't live. Chases only follow approved work orders. Existing bookings were marked approved (they were sent under the old flow).
- **Sidebar:** each heading is a dropdown with its own pages (e.g. Sales & Marketing → Leads, Import leads, Sales numbers, Marketing, Phone); the heading you're in opens itself, and open headings are remembered per browser.
- **Links page** (Admin → Links): 1) founder/management and 2) team members both sign in at /login (what they see depends on access); 3) couples and families at /portal/login; 4) guests' public page per wedding (/g/…). Vendors don't sign in; each approved work order emails them a private link.

## D38 — Claude connector (MCP) (2026-10-12)
**Decision:** Wiwaha OS has a remote MCP server at `/api/mcp` so the team can use it from Claude (claude.ai, desktop and phone apps, Pro plan and up). It is an addition to the app, not a replacement (D32 decided against building the app *as* a connector).
- **Auth:** our own small OAuth 2.1 server (dynamic client registration, authorisation code with PKCE S256, rotating refresh tokens), because claude.ai custom connectors need OAuth. People sign in with their normal Wiwaha login and press Allow. Tokens are hashed at rest (`mcp_clients`, `mcp_codes`, `mcp_tokens`; service role only, people can see their own connections).
- **Acts as the person:** each call uses a short Supabase session for that person (admin magic link, never emailed), so RLS, the audit log (`surface = mcp`, with the caller's IP as Vercel sees it, which is Claude's server rather than the person's device) and every database rule apply unchanged. No new secret was needed.
- **Who:** `MCP_ALLOWED_ROLES`, owner only to start (tested with a dummy owner account, admin@wiwaha.example, on staging).
- **Tools:** about 30, reading and changing what the app does (see `docs/runbooks/claude-connector.md`). Writes reuse the same RPCs and checks as the app (approvals, payment parts, work-order approval, décor double-booking, policy schemas). After a change, agent routing and approved messages run as in the app.
- **Disconnect:** Settings → Claude connector, or remove it in Claude.

## D39 — Venue areas and the media library (2026-10-16)
**Decision:** the estate's photos and clips live in one library (`media_assets`, public `media` bucket) with folders up to four deep (`media_folders`). Each photo has a *look* (plain, decorated, event, detail, people, aerial), an optional angle, and optionally a **venue area** (`venue_areas`: Main entrance, Lobby pathway, Lawn entrance, Lawn, Indoor hall, Pool deck, Amphitheatre, Courtyard; editable in Décor → Venue areas). One plain photo per area is its *primary* (unique index), used as the base for AI moodboards; several angles are welcome.
- Every upload is described automatically (Claude with the image) so the studio and moodboards can pick shots by meaning; staff can overwrite the description.
- Décor templates gained `venue_area_id`, so "Templates by area" and AI moodboards share the same areas.
- Owner, sales, event managers and staff can upload; clients see only what reaches a shared moodboard.

## D40 — Décor questionnaire and AI moodboards per area (2026-10-16)
**Decision:** when the Décor stage opens (90 days out, D35), the Design agent opens an Indian décor questionnaire in the portal (`decor_briefs`), never before the stage opens: traditions, look and fullness, up to three colour stories, flowers, traditional touches (toran, kolam/rangoli, banana-leaf entrance, name board, urli, …), mandap style, and per function the spaces, mood, seating, lighting and must-haves. The team can send a reminder or make boards from partial answers in the Wedding Room.
- On submit (`save_decor_brief(..., true)`), the agent makes one AI board per function: for each chosen area (or the usual ones for that function) it dresses the area's primary plain photo with fal image edit, guided by the answers and the area's décor templates. The original photo is always shown next to the result ("as it is" / "could look"), and AI pictures are labelled as previews.
- **Visibility:** AI boards are hidden from the couple (`shared_at` null; RLS) until Prashanth approves them (approval kind `moodboard`) or the Design agent's dial allows sharing. Standard vs Custom is still labelled.
- **Changes:** the couple can ask for a change on any picture (up to `decor.ai_moodboards.redos_per_slide`, then the décor team edits by hand). The team can redo a slide, upload their own edited image, start over, or upload an edited PDF deck.
- **Download:** `/api/moodboards/<id>/pdf` builds the deck in the shape of the team's own decks (cover with names and palette, a title page per function, then each space as it is next to the décor). Couple and team both can download it.
- Policy `decor.ai_moodboards` holds the limits and labels; no business rule is in prompts.

## D41 — Content studio inside Wiwaha OS, on fal and Claude only (2026-10-16)
**Decision:** wiwaha-studio is ported into the app (Sales & Marketing → Content studio) rather than run as a second service. Text is Claude (existing `ANTHROPIC_API_KEY`); every image, voice, music and video model runs on fal with one `FAL_KEY`.
- **Flow:** calendar (strategist: pillars, angle and hook per slot; next week planned every week, replacing the caption-only drafts) → script (scriptwriter; team edits or approves) → render. Formats: single post, carousel, reel. Approving a script counts against `studio.content.monthly_generations` (warning at `warn_at_pct`).
- **Real photos only:** venue imagery always comes from the library; AI clips (image-to-video from a real photo) are capped per reel (`max_ai_clips_per_reel`) and slides never alter a photo. The house renderer (`next/og`: Cormorant Garamond + Poppins, gold accent only, no boxes behind text, typographic CTA) draws the type.
- **Reels:** ffmpeg on Vercel (`ffmpeg-static`, traced into `/api/media/work` and `/api/cron/tick`): Ken Burns shots, cuts and crossfades, word-timed captions, the logo, voiceover (fal TTS) over ducked music (fal music), loudness-normalised.
- **Worker:** `media_jobs` rows are claimed by status; fal calls back to `/api/webhooks/fal` (signature or `?k=WEBHOOK_SECRET`), and `/api/media/work` (self-kicking) plus the 15-minute tick finish the rest. Without `FAL_KEY` everything runs in sandbox.
- **Download:** each finished item downloads as a zip (slides or reel plus `caption.txt`). Posting to Instagram stays manual until the Meta keys are approved.

