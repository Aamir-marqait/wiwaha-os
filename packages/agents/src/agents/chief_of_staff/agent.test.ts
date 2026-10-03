import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NoLlm, ScriptedLlm } from "../../framework/llm";
import { MemoryAgentStore } from "../../framework/memory-store";
import type { AgentDeps, BriefData } from "../../framework/types";
import { PROMPTS } from "../../prompts.generated";
import { createDispatcher } from "../../dispatch";
import { morningBrief, routeFor, routeTasks } from "./agent";

const NOW = new Date("2026-10-03T03:00:00Z"); // 8:30 am IST

const DATA: BriefData = {
  date: "2026-10-03",
  newLeads: [{ id: "l1", name: "Meera Iyer", source: "wedmegood", score: 88, hot: true, dateWanted: "2027-04-21", guests: 250 }],
  hotLeadsWaiting: [{ id: "l1", name: "Meera Iyer", score: 88, status: "new" }],
  visitsToday: [{ id: "v1", leadName: "Priya Natarajan", at: "2026-10-03T05:30:00Z", executive: "Kavya Shetty", attendees: "Priya and Karthik" }],
  followUpsDue: [{ visitId: "v2", leadName: "Deepak Nair", dueAt: "2026-10-03T04:00:00Z" }],
  holdsExpiring: [{ id: "h1", label: "Rhea Kapoor (hold)", resource: "The Grand Lawn", startsOn: "2027-05-31", expiresAt: "2026-10-03T23:00:00Z" }],
  pendingApprovals: [{ kind: "lead_reply", count: 3, oldestAt: "2026-10-02T10:00:00Z" }],
  humanQueue: [{ id: "q1", title: "Out-of-town family asked for a starting price", reason: "off_policy", createdAt: "2026-10-02T12:00:00Z" }],
  overdueTasks: [{ id: "t1", title: "AC servicing overdue", owner: "Manjunath", dueAt: "2026-09-28T00:00:00Z", priority: "high", wedding: null }],
  paymentsDue: [{ id: "p1", wedding: "Ananya & Rohan", label: "40% — signs the contract", amountPaise: 18_00_000_00, dueOn: "2026-10-07", status: "scheduled" }],
  upcomingWeddings: [],
  stagesToNudge: [],
  agentIssues: [],
  disabledAgents: [],
};

function setup(llm: AgentDeps["llm"] = new NoLlm()) {
  const store = new MemoryAgentStore();
  store.brief = DATA;
  return { store, deps: { store, llm, now: () => NOW } as AgentDeps };
}

describe("Chief of Staff: morning brief", () => {
  it("writes the 8:30 brief from data without an API key", async () => {
    const { store, deps } = setup();
    const out = await morningBrief(deps);
    expect(out.status).toBe("done");
    if (out.status !== "done") return;
    expect(out.result.headlineSource).toBe("template");
    expect(out.result.title).toContain("Saturday");
    const md = out.result.contentMd;
    expect(md).toContain("3 items waiting for your approval");
    expect(md).toContain("Out-of-town family asked for a starting price");
    expect(md).toContain("Priya Natarajan");
    expect(md).toContain("The one follow-up call · **Deepak Nair**");
    expect(md).toContain("Rhea Kapoor (hold)");
    expect(md).toContain("₹18,00,000");
    expect(store.briefs).toHaveLength(1);
    expect(store.actions[0]).toMatchObject({ action: "morning_brief", status: "ok" });
    expect(store.notifications[0]).toMatchObject({ role: "owner", link: "/team" });
  });

  it("uses the model only for the headline, on the configured model", async () => {
    const llm = new ScriptedLlm(() => "Three replies wait for you; Deepak's single follow-up call is due today.");
    const { deps } = setup(llm);
    const out = await morningBrief(deps);
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.headlineSource).toBe("llm");
    expect(out.result.contentMd.startsWith("Three replies wait for you")).toBe(true);
    expect(llm.calls[0]!.model).toBe("claude-opus-5-5");
    expect(llm.calls[0]!.system).toContain("## POLICY BOOK");
    // the detailed sections are always data-driven
    expect(out.result.contentMd).toContain("### Needs your decision");
  });

  it("is paused by the kill switch", async () => {
    const { store, deps } = setup();
    store.setAgent("chief_of_staff", { enabled: false });
    const out = await morningBrief(deps);
    expect(out.status).toBe("disabled");
    expect(store.humanQueue[0]).toMatchObject({ reason: "agent_disabled", title: "Write the 8:30 am brief" });
  });
});

describe("Chief of Staff: routing", () => {
  it("routes stage starts to the stage's agent", () => {
    expect(routeFor({ kind: "stage_started", payload: { stage_key: "decor" } })).toBe("design");
    expect(routeFor({ kind: "hold_released_notify_client", payload: {} })).toBe("lead_desk");
    expect(routeFor({ kind: "unknown", payload: {} })).toBeNull();
  });

  it("holds work for an agent that is switched off and gives it to a person", async () => {
    const { store, deps } = setup();
    store.setAgent("design", { enabled: false });
    store.tasks = [{ id: "t1", from_agent: null, to_agent: null, kind: "stage_started", payload: { stage_key: "decor" }, lead_id: null, wedding_id: "w1", status: "queued", created_at: NOW.toISOString() }];
    const out = await routeTasks(deps, createDispatcher(deps));
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result).toEqual({ routed: 0, held: 1, done: 0 });
    expect(store.tasks[0]!.status).toBe("held");
    expect(store.humanQueue[0]).toMatchObject({ weddingId: "w1", assignedRole: "event_manager" });
  });

  it("dispatches a lapsed hold to Lead Desk, which drafts a gated note", async () => {
    const { store, deps } = setup();
    store.leads = [{
      id: "lead-9", contact_id: "c", source: "phone", source_detail: null, event_type: "wedding", date_wanted: "2027-05-31", date_flexible: false, alt_dates: [],
      guest_count: 300, budget_paise: null, budget_text: null, rooms_needed: null, city: "Mumbai", message: null, score: 64, score_breakdown: null, hot: false,
      status: "contacted", assigned_to: null, hold_expires_at: null, wedding_id: null, touch_count: 1, first_touch_at: "", last_touch_at: "", created_at: "",
      contact: { id: "c", full_name: "Rhea Kapoor", phone_e164: "+919900011104", email: null, city: "Mumbai" },
    }];
    store.tasks = [{ id: "t2", from_agent: null, to_agent: null, kind: "hold_released_notify_client", payload: { starts_on: "2027-05-31" }, lead_id: "lead-9", wedding_id: null, status: "queued", created_at: NOW.toISOString() }];
    const out = await routeTasks(deps, createDispatcher(deps));
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result).toEqual({ routed: 1, held: 0, done: 1 });
    expect(store.approvals[0]).toMatchObject({ kind: "lead_reply", agentKey: "lead_desk", leadId: "lead-9" });
    expect(String((store.approvals[0]!.payload as { body: string }).body)).toMatch(/hold on .* has now lapsed/);
  });
});

describe("Prompt hygiene", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  it("prompt.md is bundled verbatim and holds no business rules", () => {
    const md = readFileSync(join(here, "prompt.md"), "utf8");
    expect(PROMPTS.chief_of_staff).toBe(md);
    expect(md).not.toMatch(/₹|\d+\s*%|\d+\s*(hours|days)|lakh/i);
  });
});

describe("Chief of Staff: new leads", () => {
  it("routes a new enquiry to Lead Desk exactly once, even if two runs overlap", async () => {
    const { store, deps } = setup();
    store.spaces = [{ id: "s1", name: "The Grand Lawn", capacity: 1000, takenDates: [] }];
    store.leads = [{
      id: "lead-new", contact_id: "c", source: "website", source_detail: null, event_type: "wedding", date_wanted: "2027-02-14", date_flexible: false, alt_dates: [],
      guest_count: 200, budget_paise: null, budget_text: null, rooms_needed: null, city: "Bengaluru", message: "Is 14 Feb free?", score: null, score_breakdown: null, hot: false,
      status: "new", assigned_to: null, hold_expires_at: null, wedding_id: null, touch_count: 1, first_touch_at: "", last_touch_at: "", created_at: "",
      contact: { id: "c", full_name: "Isha Rao", phone_e164: "+919900000001", email: null, city: "Bengaluru" },
    }];
    store.tasks = [{ id: "t-new", from_agent: null, to_agent: null, kind: "new_lead", payload: {}, lead_id: "lead-new", wedding_id: null, status: "queued", created_at: NOW.toISOString() }];
    const dispatch = createDispatcher(deps);
    const [a, b] = await Promise.all([routeTasks(deps, dispatch), routeTasks(deps, dispatch)]);
    const routed = [a, b].reduce((s, o) => s + (o.status === "done" ? o.result.routed : 0), 0);
    expect(routed).toBe(1);
    expect(store.approvals.filter((x) => x.leadId === "lead-new")).toHaveLength(1);
    expect(store.leads[0]!.score).not.toBeNull();
    expect(store.tasks[0]!.status).toBe("done");
  });
});
