# Wiwaha OS — Build Handoff for Fable 5.1

Oct 3, 2026 · @Sid Rao

Everything you need to start building Wiwaha OS in Cowork with Fable 5.1: the context to give it, the rules it must follow, the Phase 1 brief and a ready-to-paste kickoff prompt.

## 1. How to use this doc

Start a fresh Cowork session with Fable 5.1, give it this doc and the PRD, then paste the kickoff prompt in section 7.

1. Open a new Cowork session and pick **Claude Fable 5.1** in the model picker.
2. Create an empty folder (or GitHub repo) called `wiwaha-os` and attach it to the session.
3. Attach three things: this handoff doc, the [Wiwaha OS PRD](https://claude.ai/code/artifact/a1c1249e-2dc2-46b2-a1d9-cc5dc6a8e306), and the *Wiwaha by Praman Digital Brand Persona* PDF.
4. Paste the kickoff prompt from section 7.
5. Let Fable finish Phase 1 before starting Phase 2. Start each new phase in a fresh session with its prompt from section 8, so the context stays clean.

Fable will write a `CLAUDE.md` file in the repo on day one. It's the project's memory, so every later session (Fable or Opus) picks up the same rules automatically.

## 2. Project context

Wiwaha OS is the operating system for Wiwaha by Praman, a 4-acre wedding and events estate in Bengaluru with 30 guest rooms (expanding to 60). Founder Prashanth wants the business run by AI agents, with him and a small team approving what matters.

- **Built by:** Sid, with MARQAIT Digital (Wiwaha's branding and marketing agency).
- **Three verticals:** Sales & Marketing (with a voice agent), Event Management & CRM, Operations & Project Management.
- **Two front ends:** a team dashboard (staff, Prashanth) and a client portal where couples choose when each planning stage starts.
- **The core record:** the *Wedding Room*, one record per wedding holding every message, file, task and payment.
- **Agents:** 21 agents under one Chief of Staff agent (full list in PRD section 8).
- **Brand look:** sage green, warm gold, ivory, deep burgundy; elegant, warm, premium.
- **Users' languages:** English first; Kannada and Hindi options in the portal; the voice agent also speaks Tamil and Telugu.

## 3. Non-negotiable business rules

These come straight from Prashanth. Store them as data in the policy book, not hard-coded, but the defaults must be exactly these.

| Area | Rule |
| --- | --- |
| Honesty | Agents never make a commitment that isn't in the policy book. Unknown → escalate to a human. |
| Pricing on calls | No prices quoted on the phone; invite the caller to visit. Out-of-town callers may get the approved "starting from" band plus the brochure and video tour on WhatsApp. |
| Follow-up | Exactly one follow-up call, two days after a site visit. No response = stop calling. |
| Payments | 10% deposit holds the date; 40% within two weeks signs the contract; 50% due 30 days before the event. |
| Contract | Plain black-and-white template; e-signature. |
| Décor | Only the in-house team or a designated planner. Venue provides infrastructure (power, complimentary rooms). |
| Moodboards | About five per function, broad themes first, then detail. Standard and custom labelled clearly. |
| Planning start | Recommended \~90 days before; the couple can start any stage earlier, but never before its payment unlock. |
| Audit | Every portal edit logs user, time and IP address. |
| Reviews | Personalised review form by email after each event; low scores reach Prashanth within 2 hours. |
| Farewell | Thank-you note, parting gift (chocolates or an Amazon voucher), added to the newsletter. |

## 4. Stack, repo layout and conventions

One TypeScript monorepo: one web app serves both the team dashboard and the client portal, and a separate worker package runs the agents.

**Stack:** Next.js (App Router) + TypeScript + Tailwind on Vercel · Supabase (Postgres, Auth, Storage, row-level security) · Claude API with the Agent SDK for agents · Inngest (or Supabase cron) for scheduled jobs · Razorpay · WhatsApp Business Platform via a BSP · Exotel or Plivo for voice.

```
wiwaha-os/
  CLAUDE.md              project rules for every session
  apps/
    web/                 Next.js: /team dashboard, /portal client portal
  packages/
    db/                  schema, migrations, seed data, generated types
    agents/              one folder per agent: prompt, tools, gate, tests
    policy/              policy book loader and validators
    integrations/        whatsapp, razorpay, telephony, email, esign
    ui/                  shared components in the Wiwaha palette
  docs/                  PRD, decisions log, runbooks
```

**Conventions**

- Strict TypeScript; no `any`.
- Every table has row-level security from the first migration; roles: `owner`, `sales`, `event_manager`, `staff`, `accounts`, `client`, `vendor`, `agent`.
- Money stored as integer paise; dates in UTC, shown in Asia/Kolkata.
- Every agent action writes an `agent_actions` row; every human edit writes an `audit_log` row with IP.
- Secrets only in environment variables; a `.env.example` lists them all.
- Mobile-first UI; test at 375 px width.
- Seed data: one fictional couple and wedding so every screen can be demoed.
- Keep `docs/decisions.md` updated with every architectural choice and why.

## 5. Agent architecture rules

Every agent is built the same way, so the 21 of them stay testable and Prashanth can control each one.

- **One folder per agent** in `packages/agents/<name>/`: `prompt.md` (role, rules, tone), `tools.ts` (only the tools this agent may call), `gate.ts` (what needs human approval), `agent.test.ts` (scenario tests).
- **Policy book only.** Agents read rules from `packages/policy`, never from their own prompt. If a question isn't covered, the agent escalates.
- **Autonomy dial per agent:** `draft` (human approves every output) → `act_and_notify` → `act_silently`. Every agent ships in `draft`. Only the owner role can change the dial.
- **Approval queue:** anything gated becomes an `approvals` row that Prashanth can approve, edit or reject from his phone.
- **Kill switch:** an `enabled` flag per agent; when off, its work lands in a human queue.
- **Chief of Staff** is the only agent that routes work between agents; agents never call each other directly.
- **Model choice at runtime:** Haiku for high-volume triage (Lead Desk scoring, message classification), Sonnet for most agents, Opus or Fable for the Chief of Staff, Design and Quote reasoning. Keep the model name in config, not code.
- **Every run logged** to `agent_actions`: agent, input, output, tools used, cost, approved by.
- **Scenario tests** for every agent, including the hard ones: a caller demanding a price, a request for a discount, a décor request before the 40% payment.

## 6. Phase 1 brief: Foundation

Phase 1 builds the skeleton every later phase plugs into: the database, logins, the policy book, one calendar, one lead inbox and the first two agents.

**Build, in this order**

1. Repo scaffold, `CLAUDE.md`, `.env.example`, `docs/decisions.md`.
2. Full database schema for every entity in PRD section 10, with RLS, migrations and seed data. Design it all now, even tables used in later phases.
3. Auth and roles; invite flow for staff; separate client login for the portal.
4. Policy book: an editable screen for Prashanth plus a typed loader agents use. Seed it with the rules in section 3.
5. Availability calendar: every space and room, colour-coded (enquiry, held, confirmed), with soft holds that expire.
6. Lead inbox: one list for leads from the website form and manual entry (channel connectors come in Phase 2), with de-duplication by phone.
7. Team dashboard shell in the Wiwaha palette: today, leads, calendar, weddings, approvals, settings.
8. Agent framework (section 5) plus two agents in `draft` mode: **Chief of Staff** (writes the 8:30 am brief) and **Lead Desk** (scores and drafts replies).
9. Approval queue screen, mobile-first.
10. Deploy to Vercel and Supabase; share a staging link.

**Done when**

- [ ] A lead entered on the website appears in the inbox, is scored, and gets a drafted reply waiting in the approval queue.
- [ ] Holding a date on the calendar blocks it for everyone and releases automatically when it expires.
- [ ] Prashanth can change a policy rule and an agent's next answer reflects it.
- [ ] The 8:30 am brief is generated from seed data.
- [ ] Every agent action and every edit is visible in the logs.
- [ ] Staging link works on a phone.

## 7. Kickoff prompt to paste

Copy this into the new Fable 5.1 session after attaching the handoff doc, the PRD and the brand persona.

```markdown
You are the lead engineer building Wiwaha OS, an agent-run operating system for Wiwaha by Praman, a wedding estate in Bengaluru.

Read all three attached documents in full before writing any code:
1. Wiwaha OS Build Handoff (rules, stack, conventions, Phase 1 brief)
2. Wiwaha OS PRD (full product spec)
3. Wiwaha by Praman Digital Brand Persona (brand voice, palette, audience)

Then:
- Write CLAUDE.md at the repo root summarising the business rules (handoff section 3), stack and conventions (section 4) and agent rules (section 5), so every future session follows them.
- Propose the full database schema for every entity in PRD section 10 and show it to me before migrating. Flag anything in the PRD that is unclear or contradictory.
- Once I approve the schema, build Phase 1 exactly as listed in handoff section 6, in order. Commit after each numbered step with a clear message.
- Ship every agent in draft mode. Never hard-code a business rule that belongs in the policy book.
- Write scenario tests for each agent, including attempts to get it to quote a price or promise a discount.
- After each step, tell me in two lines what you built and what you need from me (keys, decisions).
- When Phase 1's "done when" checklist passes, deploy to staging and send me the link with a short demo script.

Ask me before choosing any paid service that isn't in the handoff stack.
```

## 8. Prompts for phases 2–4

Start each phase in a fresh session on the same repo; `CLAUDE.md` carries the rules forward.

**Phase 2 — Sales engine (Fable)**

```markdown
Read CLAUDE.md and PRD sections 4 and 8. Build Phase 2: connect WhatsApp, Instagram DMs, Meta and Google lead forms and WedMeGood email leads into the lead inbox; build the Voice Concierge on our telephony provider (inbound answering, visit booking, the single follow-up call two days after a visit, live human handover, recording and transcript on the lead); build Visit Host (pre-visit brief, checklist, voice notes after the visit) and Reputation (review form, Google review replies in draft). All agents in draft mode. Write scenario tests for the voice agent covering price requests, out-of-town callers and upset callers.
```

**Phase 3 — Wedding Room and client portal (Fable)**

```markdown
Read CLAUDE.md and PRD sections 5, 7 and 8. Build Phase 3: contract generation and e-signature; the 10/40/50 payment schedule on Razorpay with reminders; onboarding (welcome letter, logins for couple, parents and planner); the client portal with stage cards, Start buttons and unlock rules; Brief, Menu, Design (about five moodboards per function), Quote and Vendor Coordinator agents; the Wedding Room agent in the family WhatsApp group. Run one complete fictional wedding end to end and show me the demo.
```

**Phase 4 — Operations and growth (Opus 5.5 is fine)**

```markdown
Read CLAUDE.md and PRD sections 6, 8 and 12. Build Phase 4: T-minus plan generator from templates, task lists with photo proof on mobile, the 8:30 am and 7 pm stand-up briefs, rooms and guests, estate maintenance and inventory, finance (final invoices, GST, per-wedding profit), offboarding sequence, Content Studio and Ads Analyst agents. Add the owner dashboard with the five morning numbers.
```

## 9. Accounts and keys to set up

Phase 1 needs only the first four. Open the others early, because WhatsApp and payment approvals in India can take a week or more.

| Account | Needed for | Phase |
| --- | --- | --- |
| GitHub (repo `wiwaha-os`) | Code and history | 1 |
| Supabase project | Database, logins, files | 1 |
| Vercel project | Hosting the dashboard and portal | 1 |
| Claude API key (Claude Platform console) | Running the agents | 1 |
| Inngest (or use Supabase cron) | Scheduled briefs and reminders | 1 |
| WhatsApp Business Platform via a BSP (Gupshup or Interakt), verified business | Messages, groups workflow, reminders | 2 |
| Exotel or Plivo, with a Wiwaha number | Voice Concierge | 2 |
| Meta Business (Instagram, Facebook, lead forms) and Google Ads access | Lead capture and ad reporting | 2 |
| Razorpay, KYC complete | Payment links and reconciliation | 3 |
| Digio or Leegality | Contract e-signature | 3 |
| Domain, e.g. os.wiwaha… and portal.wiwaha… | Branded links for team and clients | 3 |

Get Prashanth's written OK before connecting Wiwaha's live WhatsApp number, phone line or payment account.

## 10. Working tips

A few habits will keep the build fast and the code clean across many sessions.

- **Approve the schema before anything else.** It's the hardest thing to change later; spend time on it with Fable.
- **One phase per session.** Long sessions drift. Start fresh, point at `CLAUDE.md`, and give the phase prompt.
- **Ask for a plan before big steps.** "Plan this step, then wait for my OK" stops expensive wrong turns.
- **Switch to Opus 5.5 for polish.** UI tweaks, copy changes, small bugs and Phase 4 screens don't need Fable.
- **Use Fable to review.** At the end of each phase, open a fresh Fable session and ask it to review the repo against `CLAUDE.md` and the PRD, as a reviewer who didn't write it.
- **Test with real stories.** Before going live, replay one past Wiwaha wedding through the system with real dates and guest counts.
- **Keep agents in draft longer than feels necessary.** Move an agent to `act_and_notify` only after a couple of weeks of clean drafts the team approved unedited.
- **Feed in the templates when they arrive.** The Drive folder's checklists and planning templates belong in `packages/policy` and the Planner agent's template library.
