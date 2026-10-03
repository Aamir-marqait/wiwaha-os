/**
 * The 21 agents from PRD §8. Seeds the `agents` table; the owner then controls
 * the autonomy dial, kill switch and model per agent in Settings → Agents.
 * Every agent ships in `draft`. Agents not yet built (later phases) ship disabled.
 */
export type Vertical = "all" | "sales_marketing" | "event_crm" | "operations";

export interface AgentRosterEntry {
  key: string;
  name: string;
  vertical: Vertical;
  job: string;
  humanGate: string;
  phase: 1 | 2 | 3 | 4;
  model: string;
}

// Model choice per handoff §5: Haiku for triage, Sonnet for most, Opus for
// Chief of Staff / Design / Quote reasoning. Stored in the DB, editable at runtime.
const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";

export const AGENT_ROSTER: readonly AgentRosterEntry[] = [
  { key: "chief_of_staff", name: "Chief of Staff", vertical: "all", job: "Routes work between agents, writes Prashanth's daily brief, watches SLAs", humanGate: "Prashanth sets priorities", phase: 1, model: OPUS },
  { key: "voice_concierge", name: "Voice Concierge", vertical: "sales_marketing", job: "Answers and makes calls, books visits, one follow-up call", humanGate: "Live handover on request", phase: 2, model: SONNET },
  { key: "lead_desk", name: "Lead Desk", vertical: "sales_marketing", job: "Unifies inbound channels, de-dupes, scores, replies", humanGate: "Hot leads to sales exec", phase: 1, model: HAIKU },
  { key: "visit_host", name: "Visit Host", vertical: "sales_marketing", job: "Pre-visit brief, visit checklist, post-visit recap", humanGate: "Executive runs the visit", phase: 2, model: SONNET },
  { key: "content_studio", name: "Content Studio", vertical: "sales_marketing", job: "Drafts posts, reels scripts, captions per weekly rhythm", humanGate: "Approve before posting", phase: 4, model: SONNET },
  { key: "ads_analyst", name: "Ads Analyst", vertical: "sales_marketing", job: "Tracks spend, cost per enquiry and per booking; proposes shifts", humanGate: "Budget changes approved", phase: 4, model: SONNET },
  { key: "reputation", name: "Reputation", vertical: "sales_marketing", job: "Review forms, Google/WedMeGood replies, testimonial capture", humanGate: "Low scores to Prashanth", phase: 2, model: SONNET },
  { key: "wedding_room", name: "Wedding Room", vertical: "event_crm", job: "Lives in each WhatsApp group and portal; logs decisions, answers routine questions", humanGate: "Escalates anything off-policy", phase: 3, model: SONNET },
  { key: "onboarding", name: "Onboarding", vertical: "event_crm", job: "Welcome letter, logins, portal walkthrough", humanGate: "None", phase: 3, model: SONNET },
  { key: "contract_payments", name: "Contract & Payments", vertical: "event_crm", job: "Contract generation, 10/40/50 schedule, reminders, receipts", humanGate: "Prashanth signs contracts", phase: 3, model: SONNET },
  { key: "brief", name: "Brief", vertical: "event_crm", job: "Guides the couple through ceremonies, guests, rituals", humanGate: "Event manager reviews", phase: 3, model: SONNET },
  { key: "design", name: "Design", vertical: "event_crm", job: "~5 moodboards per function, refines on feedback", humanGate: "Décor lead finalises; Prashanth for custom", phase: 3, model: OPUS },
  { key: "menu", name: "Menu", vertical: "event_crm", job: "Menu options by cuisine, tasting booking, plate counts", humanGate: "Chef confirms", phase: 3, model: SONNET },
  { key: "quote", name: "Quote", vertical: "event_crm", job: "Prices brief + décor + menu from price book", humanGate: "Off-book items to Prashanth", phase: 3, model: OPUS },
  { key: "vendor_coordinator", name: "Vendor Coordinator", vertical: "event_crm", job: "Locks vendor dates, sends briefs, tracks confirmations, scores vendors", humanGate: "Vendor payments approved", phase: 3, model: SONNET },
  { key: "planner", name: "Planner", vertical: "operations", job: "Builds T-minus plan and run-of-show from templates", humanGate: "Event manager signs off", phase: 4, model: SONNET },
  { key: "standup", name: "Stand-up", vertical: "operations", job: "8:30 am and 7 pm briefs, chases overdue tasks", humanGate: "Escalates to manager", phase: 4, model: SONNET },
  { key: "rooms_guests", name: "Rooms & Guests", vertical: "operations", job: "Room allocation, rooming lists, pickups, housekeeping schedule", humanGate: "Front desk confirms", phase: 4, model: SONNET },
  { key: "estate", name: "Estate", vertical: "operations", job: "Maintenance schedule, inventory, utility readings", humanGate: "Purchases over limit approved", phase: 4, model: SONNET },
  { key: "finance", name: "Finance", vertical: "operations", job: "Final invoices, GST, reconciliation, per-wedding profit", humanGate: "Accounts reviews", phase: 4, model: SONNET },
  { key: "offboarding", name: "Offboarding", vertical: "operations", job: "Thank-you, gift order, newsletter, referral ask, anniversaries", humanGate: "Gift budget approved once", phase: 4, model: SONNET },
];

export const PHASE_ONE_AGENTS = AGENT_ROSTER.filter((a) => a.phase === 1).map((a) => a.key);
