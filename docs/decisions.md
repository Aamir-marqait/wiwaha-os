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
