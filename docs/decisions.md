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

## D18 — Daily routing sweep so staging runs on Vercel Hobby (2026-10-03)
Vercel Hobby allows cron jobs once a day, so `/api/cron/agents` runs at 02:45 UTC (8:15 IST), just before the brief. Routing still happens instantly on every enquiry (`after()`), and `pg_cron` still releases holds every 15 minutes, so the sweep is only a safety net. On Vercel Pro, change it back to hourly (`30 * * * *`). Note: Vercel Hobby is for non-commercial use; Wiwaha's production should run on Pro.
