import type { Json } from "@wiwaha/db";
import { formatDateIST, formatDateTimeIST, rupees, todayIST } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps, AgentTaskRow, BriefData } from "../../framework/types";
import { PROMPTS } from "../../prompts.generated";
import type { ChiefOfStaffStore } from "./tools";

export const CHIEF_OF_STAFF = "chief_of_staff";
const BRIEF_POLICIES: readonly PolicyKey[] = ["honesty.commitments", "briefs.schedule", "discounts", "holds.soft_hold", "payments.schedule"];

export interface BriefResult {
  briefId: string;
  title: string;
  contentMd: string;
  headlineSource: "llm" | "template";
}

/** Writes Prashanth's 8:30 am brief from live data. */
export async function morningBrief(deps: AgentDeps, opts: { date?: string } = {}): Promise<RunOutcome<BriefResult>> {
  return runAgent(deps, CHIEF_OF_STAFF, { action: "morning_brief", input: { date: opts.date ?? null }, fallbackTitle: "Write the 8:30 am brief" }, async (ctx) => {
    const store: ChiefOfStaffStore = deps.store;
    const t0 = Date.now();
    const date = opts.date ?? todayIST(ctx.now);
    const data = await store.briefData(date);

    let headline = templateHeadline(data);
    let headlineSource: "llm" | "template" = "template";
    let usage: { model: string | null; inputTokens: number | null; outputTokens: number | null; costUsdMicros: number | null } = { model: null, inputTokens: null, outputTokens: null, costUsdMicros: null };
    if (deps.llm.available) {
      try {
        const res = await deps.llm.complete({
          model: ctx.agent.model,
          system: `${PROMPTS[CHIEF_OF_STAFF] ?? ""}\n\n## POLICY BOOK\n${ctx.book.digest(BRIEF_POLICIES)}`,
          prompt: `SNAPSHOT for ${formatDateIST(date, { weekday: "long", day: "numeric", month: "long" })}:\n${JSON.stringify(data, null, 2)}\n\nWrite the headline.`,
          maxTokens: 2000,
          effort: "medium",
        });
        if (res.text.trim()) {
          headline = res.text.trim();
          headlineSource = "llm";
        }
        usage = { model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsdMicros: res.costUsdMicros };
      } catch {
        // keep the template headline
      }
    }

    const title = `Morning brief · ${formatDateIST(date, { weekday: "long", day: "numeric", month: "long" })}`;
    const contentMd = renderBrief(data, headline);
    const actionId = await ctx.log({
      action: "morning_brief", status: "ok",
      input: { date }, output: { title, headline, headline_source: headlineSource, counts: counts(data) },
      toolsUsed: ["briefData", "saveBrief"], policyKeys: [...BRIEF_POLICIES], policyVersions: ctx.book.versions(BRIEF_POLICIES),
      model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsdMicros: usage.costUsdMicros,
      durationMs: Date.now() - t0,
    });
    const briefId = await store.saveBrief({ kind: "morning", forDate: date, title, contentMd, data: data as unknown as Json, agentActionId: actionId });
    await store.notify({ role: "owner", title, body: headline.slice(0, 180), link: "/team" });
    return { briefId, title, contentMd, headlineSource };
  });
}

function counts(d: BriefData): Json {
  return {
    new_leads: d.newLeads.length,
    hot_waiting: d.hotLeadsWaiting.length,
    visits_today: d.visitsToday.length,
    follow_ups_due: d.followUpsDue.length,
    holds_expiring: d.holdsExpiring.length,
    approvals: d.pendingApprovals.reduce((s, a) => s + a.count, 0),
    escalations: d.humanQueue.length,
    overdue_tasks: d.overdueTasks.length,
    payments_due: d.paymentsDue.length,
  };
}

export function templateHeadline(d: BriefData): string {
  const approvals = d.pendingApprovals.reduce((s, a) => s + a.count, 0);
  const s: string[] = [];
  const decisions: string[] = [];
  if (approvals) decisions.push(`${approvals} item${approvals === 1 ? "" : "s"} waiting for your approval`);
  if (d.humanQueue.length) decisions.push(`${d.humanQueue.length} escalation${d.humanQueue.length === 1 ? "" : "s"} that need a person`);
  s.push(decisions.length ? `Good morning, Prashanth. You have ${decisions.join(" and ")}.` : "Good morning, Prashanth. Nothing is waiting on your decision this morning.");
  const risks: string[] = [];
  if (d.overdueTasks.length) risks.push(`${d.overdueTasks.length} overdue task${d.overdueTasks.length === 1 ? "" : "s"}`);
  if (d.holdsExpiring.length) risks.push(`${d.holdsExpiring.length} date hold${d.holdsExpiring.length === 1 ? "" : "s"} expiring within 48 hours`);
  const overduePay = d.paymentsDue.filter((p) => p.status === "overdue").length;
  if (overduePay) risks.push(`${overduePay} overdue payment${overduePay === 1 ? "" : "s"}`);
  if (risks.length) s.push(`Watch ${risks.join(", ")}.`);
  const good: string[] = [];
  if (d.newLeads.length) good.push(`${d.newLeads.length} new enquir${d.newLeads.length === 1 ? "y" : "ies"} since yesterday${d.hotLeadsWaiting.length ? ` (${d.hotLeadsWaiting.length} hot)` : ""}`);
  if (d.visitsToday.length) good.push(`${d.visitsToday.length} site visit${d.visitsToday.length === 1 ? "" : "s"} today`);
  if (good.length) s.push(`On the bright side: ${good.join(" and ")}.`);
  return s.join(" ");
}

export function renderBrief(d: BriefData, headline: string): string {
  const out: string[] = [headline, ""];
  const section = (title: string, rows: string[], empty?: string) => {
    if (!rows.length && !empty) return;
    out.push(`### ${title}`);
    out.push(...(rows.length ? rows : [`_${empty}_`]));
    out.push("");
  };

  section("Needs your decision", [
    ...d.pendingApprovals.map((a) => `- **${a.count}** × ${a.kind.replace(/_/g, " ")} (oldest ${formatDateTimeIST(a.oldestAt)}) → [Approvals](/team/approvals)`),
    ...d.humanQueue.map((h) => `- ${h.title} _(${h.reason.replace(/_/g, " ")})_`),
  ], "Nothing waiting.");
  section("Today", [
    ...d.visitsToday.map((v) => `- Site visit · **${v.leadName}** at ${formatDateTimeIST(v.at)}${v.executive ? ` with ${v.executive}` : ""}${v.attendees ? ` (${v.attendees})` : ""}`),
    ...d.followUpsDue.map((f) => `- The one follow-up call · **${f.leadName}** (due ${formatDateTimeIST(f.dueAt)})`),
  ], "No visits or follow-ups scheduled.");
  section("Leads", [
    ...d.newLeads.map((l) => `- ${l.hot ? "🔥 " : ""}**${l.name}** · ${l.source}${l.score !== null ? ` · score ${l.score}` : ""}${l.dateWanted ? ` · ${formatDateIST(l.dateWanted)}` : ""}${l.guests ? ` · ${l.guests} guests` : ""}`),
    ...d.hotLeadsWaiting.filter((h) => !d.newLeads.some((n) => n.id === h.id)).map((h) => `- Hot lead still waiting · **${h.name}** (${h.score}, ${h.status})`),
  ], "No new enquiries in the last 24 hours.");
  section("Risks", [
    ...d.overdueTasks.map((t) => `- Overdue · ${t.title}${t.owner ? ` · ${t.owner}` : ""}${t.wedding ? ` · ${t.wedding}` : ""} (due ${formatDateIST(t.dueAt)})`),
    ...d.holdsExpiring.map((h) => `- Hold expiring · ${h.label ?? h.resource} on ${formatDateIST(h.startsOn)} (expires ${formatDateTimeIST(h.expiresAt)})`),
    ...d.paymentsDue.map((p) => `- Payment ${p.status === "overdue" ? "overdue" : "due"} · ${p.wedding}: ${p.label}, ${rupees(p.amountPaise)} on ${formatDateIST(p.dueOn)}`),
    ...d.stagesToNudge.map((s) => `- Planning stage not started · ${s.wedding}: ${s.stage} (recommended ${formatDateIST(s.recommendedStart)})`),
  ], "No risks flagged.");
  section("Coming up", d.upcomingWeddings.map((w) => `- **${w.title}** in ${w.daysAway} days (${formatDateIST(w.eventStart)})${w.guestCount ? ` · ${w.guestCount} guests` : ""}`));
  section("Agents", [
    ...d.agentIssues.map((a) => `- ${a.agentKey.replace(/_/g, " ")}: ${a.count} × ${a.status.replace(/_/g, " ")} in the last 24 h`),
    ...(d.disabledAgents.length ? [`- Switched off: ${d.disabledAgents.join(", ")}`] : []),
  ]);
  return out.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Routing. Agents never call each other; they leave agent_tasks for the
// Chief of Staff, which decides who handles each one.
// ---------------------------------------------------------------------------
const ROUTES: Record<string, string> = {
  hold_released_notify_client: "lead_desk",
  new_lead: "lead_desk",
  lead_updated: "lead_desk",
};
const STAGE_ROUTES: Record<string, string> = {
  brief: "brief",
  ceremonies: "planner",
  menus: "menu",
  decor: "design",
  guests_rooms: "rooms_guests",
  vendors: "vendor_coordinator",
  final_payment: "contract_payments",
  memories: "offboarding",
};

export function routeFor(task: Pick<AgentTaskRow, "kind" | "payload">): string | null {
  if (task.kind === "stage_started") {
    const key = typeof task.payload === "object" && task.payload && !Array.isArray(task.payload) ? task.payload.stage_key : null;
    return typeof key === "string" ? STAGE_ROUTES[key] ?? null : null;
  }
  return ROUTES[task.kind] ?? null;
}

/** Runs a routed task on its target agent. Supplied by src/dispatch.ts. */
export type Dispatcher = (target: string, task: AgentTaskRow) => Promise<{ ok: boolean; result: Json } | null>;

export interface RouteResult {
  routed: number;
  held: number;
  done: number;
}

/** Dispatches queued agent_tasks to the agent that owns them. */
export async function routeTasks(deps: AgentDeps, dispatch: Dispatcher, limit = 25): Promise<RunOutcome<RouteResult>> {
  return runAgent(deps, CHIEF_OF_STAFF, { action: "route_tasks", input: { limit }, fallbackTitle: "Route queued agent work" }, async (ctx) => {
    const store: ChiefOfStaffStore = deps.store;
    const tasks = await store.queuedAgentTasks(limit);
    const res: RouteResult = { routed: 0, held: 0, done: 0 };
    for (const task of tasks) {
      const target = routeFor(task);
      const agent = target ? await deps.store.getAgent(target) : null;
      if (!target || !agent || !agent.enabled || !agent.implemented) {
        await store.updateAgentTask(task.id, { status: "held", to_agent: target, routed_by: CHIEF_OF_STAFF, result: { reason: !target ? "no route" : !agent?.implemented ? "agent not built yet" : "agent switched off" } });
        await store.queueHuman({
          agentKey: CHIEF_OF_STAFF, reason: agent && !agent.enabled ? "agent_disabled" : "escalation",
          title: humanTitle(task, agent?.name ?? target), payload: task.payload, leadId: task.lead_id, weddingId: task.wedding_id,
          assignedRole: task.wedding_id ? "event_manager" : "sales",
        });
        res.held++;
        continue;
      }
      if (!(await store.claimAgentTask(task.id, target, CHIEF_OF_STAFF))) continue; // another run has it
      res.routed++;
      // Hand over to the target agent's entry point; it applies its own gate.
      const out = await dispatch(target, task);
      if (out) {
        await store.updateAgentTask(task.id, { status: out.ok ? "done" : "failed", result: out.result });
        if (out.ok) res.done++;
      }
    }
    await ctx.log({ action: "route_tasks", status: "ok", input: { limit }, output: res as unknown as Json, toolsUsed: ["queuedAgentTasks", "updateAgentTask"] });
    return res;
  });
}

function humanTitle(task: AgentTaskRow, agentName: string | null): string {
  if (task.kind === "stage_started") {
    const key = (task.payload as { stage_key?: string } | null)?.stage_key ?? "a stage";
    return `Couple started "${key.replace(/_/g, " ")}": ${agentName ?? "no agent"} isn't live yet, please pick it up`;
  }
  return `${task.kind.replace(/_/g, " ")}: needs a person`;
}
