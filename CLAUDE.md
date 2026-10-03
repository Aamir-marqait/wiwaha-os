# Wiwaha OS: project rules

Wiwaha OS runs **Wiwaha by Praman**, a 4-acre wedding and events estate 15 km from Bengaluru airport (30 guest rooms, expanding to 60). AI agents do the routine work; Prashanth (founder) and a small team approve what matters. Couples set the pace of planning through a client portal.

Source documents: `docs/PRD.md` (product spec), `docs/build-handoff.md` (build rules and phase prompts) and `docs/brand-persona.pdf` (voice and palette). Architectural choices and their reasons go in `docs/decisions.md`. **Update it whenever you make one.**

## Non-negotiable business rules

These live as **data** in the policy book (`policies` table, typed by `packages/policy`). Never hard-code them in prompts or app code. The seed defaults must stay exactly these:

| Area | Rule |
| --- | --- |
| Honesty | Agents never make a commitment that isn't in the policy book. If something is unknown, escalate to a human. |
| Pricing on calls | No prices quoted on the phone; invite the caller to visit. Out-of-town callers may get the approved "starting from" band plus the brochure and video tour on WhatsApp. |
| Follow-up | Exactly one follow-up call, two days after a site visit. If there's no response, stop calling. |
| Payments | 10% deposit holds the date; 40% within two weeks signs the contract; 50% due 30 days before the event. |
| Contract | Plain black-and-white template; e-signature. |
| Décor | Only the in-house team or a designated planner. The venue provides infrastructure (power, complimentary rooms). |
| Moodboards | About five per function: broad themes first, then detail. Standard and custom are labelled clearly. |
| Planning start | Recommended about 90 days before. The couple can start any stage earlier, but never before its payment unlock. |
| Audit | Every portal edit logs user, time and IP address. |
| Reviews | Personalised review form by email after each event; low scores reach Prashanth within 2 hours. |
| Farewell | Thank-you note, parting gift (chocolates or an Amazon voucher), added to the newsletter. |

## Stack

- pnpm monorepo, TypeScript everywhere.
- `apps/web`: Next.js (App Router) + Tailwind v4 on Vercel. `/team/*` is the staff dashboard and `/portal/*` is the client portal.
- Supabase: Postgres, Auth, Storage and row-level security. Migrations live in `packages/db/supabase/migrations`.
- Claude API (`@anthropic-ai/sdk`) for agents. Model names live in the `agents` table, never in code.
- Scheduling: Vercel Cron calls `/api/cron/*` (protected by `CRON_SECRET`). `pg_cron` releases expired holds.
- Later phases: Razorpay, WhatsApp via a BSP (Gupshup or Interakt), Exotel or Plivo, and Digio or Leegality.

```
apps/web/              Next.js: /team dashboard, /portal client portal, /enquire public form, /api
packages/db/           SQL migrations, seed, shared row types (src/types.ts)
packages/policy/       Policy book schema (zod), defaults, typed loader
packages/agents/       Agent framework + one folder per agent
packages/integrations/ Channel adapters (stubs until Phase 2/3)
packages/ui/           Wiwaha palette tokens + shared components
docs/                  PRD, handoff, decisions log, runbooks
```

## Conventions

- Strict TypeScript; **no `any`** (use `unknown` and narrow).
- Every table gets RLS in the migration that creates it. Roles: `owner`, `sales`, `event_manager`, `staff`, `accounts`, `client`, `vendor`, `agent`.
- Money is stored as integer **paise** (`*_paise bigint`). Dates are stored in UTC (`timestamptz`) and shown in `Asia/Kolkata`. Calendar days are `date`.
- Every agent action writes an `agent_actions` row. Every human edit writes an `audit_log` row with IP (done by DB triggers that read the `x-forwarded-for` request header; see `audit_trigger()`).
- Secrets live only in env vars, and `.env.example` lists all of them.
- Mobile-first UI; check everything at **375 px** width.
- Seed data has one fictional couple and wedding (Ananya & Rohan) so every screen can be demoed.
- Commit after each meaningful step with a clear message.

## Agent rules

Each agent lives in `packages/agents/src/agents/<name>/` and has these files:
- `prompt.md`: role, rules and tone. It contains **no business rules**; those come from the policy book at runtime.
- `tools.ts`: only the tools this agent may call.
- `gate.ts`: what needs human approval.
- `agent.test.ts`: scenario tests, including attempts to get a price, a discount, or décor before the 40% payment.

The framework (`packages/agents/src/framework/`) enforces the following:
- **Policy book only.** Agents read rules via `@wiwaha/policy`. If a question isn't covered, the agent escalates. The `guardrails.ts` check blocks price and discount commitments in any client-facing draft.
- **Autonomy dial** per agent: `draft` → `act_and_notify` → `act_silently`. Every agent ships in `draft`, and only `owner` can change the dial (enforced in the DB).
- **Approval queue:** gated output becomes an `approvals` row that the owner approves, edits or rejects.
- **Kill switch:** `agents.enabled = false` sends work to `human_queue` instead.
- **Chief of Staff is the only router.** Agents never call each other; they emit `agent_tasks` rows.
- **Model at runtime:** Haiku for triage, Sonnet for most agents, Opus or Fable for Chief of Staff, Design and Quote. Set in `agents.model`.
- **Every run is logged** to `agent_actions` (agent, input, output, tools, tokens, cost, approved by).
- With no `ANTHROPIC_API_KEY`, agents use deterministic template fallbacks so demos and tests work offline.

## Commands

```bash
pnpm install
pnpm dev                 # web app on :3000 (needs apps/web/.env.local)
pnpm typecheck           # all packages
pnpm test                # vitest in every package
pnpm db:test             # applies migrations + seed to a throwaway local Postgres and runs RLS checks
```

## Brand

The palette is sage green, warm gold, ivory and deep burgundy (tokens in `packages/ui/src/tokens.css`). The voice is warm, reassuring, elegant and never pushy ("We've got this handled"). Client-facing copy is English first, with Kannada and Hindi in the portal.
