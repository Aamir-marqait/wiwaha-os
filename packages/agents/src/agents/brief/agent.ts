import type { Json } from "@wiwaha/db";
import { formatDateIST } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { agentDb, alertStaff, proposeClientMessage, requestApproval, writeText } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { BRIEF_GATE } from "./gate";
import { BRIEF_TOOLS } from "./tools";

export const BRIEF = "brief";
const POLICIES: readonly PolicyKey[] = ["honesty.commitments", "decor.providers", "menus.rules", "planning.start", "venue.facts"];

/** Rituals and requests that change how the estate is set up. */
const SETUP_FLAGS: [RegExp, string][] = [
  [/havan|homa|agni|fire|pheras?/i, "Sacred fire: ventilation, fire extinguisher, non-flammable base"],
  [/baraat|horse|ghodi|elephant/i, "Baraat: driveway access, animal handler, timing with traffic"],
  [/firework|cracker|sky lantern/i, "Fireworks: permit and safety distance"],
  [/dj|band|music|sangeet|late night/i, "Music: sound limits and finish time"],
  [/pool|water|boat/i, "Water feature use: safety staff"],
  [/kids?|children/i, "Children: kids' corner and supervision"],
  [/wheelchair|elderly|mobility/i, "Accessibility: ramps and seating near the stage"],
];

interface FunctionRow { id: string; type: string; name: string; date: string; start_time: string | null; end_time: string | null; guest_count: number | null; rituals: string | null; space_id: string | null }

export async function onBriefStarted(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ created: boolean }>> {
  return runAgent(deps, BRIEF, { action: "brief_started", weddingId, input: {}, fallbackTitle: "Guide the couple's brief" }, async (ctx) => {
    const db = agentDb(ctx, BRIEF_TOOLS);
    const [w] = await db.select<{ id: string; title: string; event_manager_id: string | null }>("weddings", { where: { id: weddingId } });
    const existing = await db.select("wedding_briefs", { where: { wedding_id: weddingId } });
    if (existing.length === 0) await db.insert("wedding_briefs", { wedding_id: weddingId, answers: {}, status: "draft" });
    await db.update("wedding_stages", { wedding_id: weddingId, key: "brief" }, { owner_label: "Your event manager and the Brief assistant" });
    if (w?.event_manager_id) await alertStaff(deps, { userIds: [w.event_manager_id], title: `${w.title} started their brief`, body: "The couple is filling in the guided brief in the portal.", link: `/team/weddings/${weddingId}`, weddingId });
    await ctx.log({ action: "brief_started", status: "ok", weddingId, input: {}, output: { created: existing.length === 0 } });
    return { created: existing.length === 0 };
  });
}

export function missingFromBrief(functions: FunctionRow[], answers: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (functions.length === 0) missing.push("the functions you're planning (haldi, mehendi, sangeet, wedding, reception…)");
  for (const f of functions) {
    if (!f.start_time) missing.push(`a start time for the ${f.name}`);
    if (!f.guest_count) missing.push(`a guest count for the ${f.name}`);
  }
  if (!answers.cuisines && !answers.outside_caterer) missing.push("the cuisines you'd love (or whether you'll bring your own caterer)");
  return missing;
}

export function setupFlags(functions: FunctionRow[], answers: Record<string, unknown>): string[] {
  const text = [...functions.map((f) => `${f.name} ${f.rituals ?? ""}`), String(answers.rituals ?? ""), String(answers.special_requests ?? "")].join(" ");
  return SETUP_FLAGS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

/** The couple pressed "Submit brief": check gaps, flag setup needs, hand to the event manager. */
export async function onBriefSubmitted(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ missing: string[]; approvalId: string }>> {
  return runAgent(deps, BRIEF, { action: "brief_submitted", weddingId, input: {}, fallbackTitle: "Review a submitted wedding brief" }, async (ctx) => {
    const db = agentDb(ctx, BRIEF_TOOLS);
    const [w] = await db.select<{ id: string; title: string; primary_contact_id: string | null; event_start: string; event_end: string }>("weddings", { where: { id: weddingId } });
    if (!w) throw new Error("Wedding not found");
    const [brief] = await db.select<{ answers: Record<string, unknown> }>("wedding_briefs", { where: { wedding_id: weddingId } });
    const answers = brief?.answers ?? {};
    const functions = await db.select<FunctionRow>("event_functions", { where: { wedding_id: weddingId }, order: [{ column: "date" }, { column: "start_time" }] });
    const missing = missingFromBrief(functions, answers);
    const flags = setupFlags(functions, answers);
    const outside = functions.filter((f) => f.date < w.event_start || f.date > w.event_end);
    const template = [
      `Brief for ${w.title}`,
      ...functions.map((f) => `- ${f.name}: ${formatDateIST(f.date, { weekday: "short", day: "numeric", month: "short" })}${f.start_time ? ` ${f.start_time.slice(0, 5)}` : ""}${f.end_time ? `–${f.end_time.slice(0, 5)}` : ""}, ${f.guest_count ?? "?"} guests${f.rituals ? ` · rituals: ${f.rituals}` : ""}`),
      answers.cuisines ? `Cuisines: ${String(answers.cuisines)}` : null,
      answers.outside_caterer ? "Bringing an outside caterer" : null,
      answers.special_requests ? `Requests: ${String(answers.special_requests)}` : null,
      flags.length ? `Setup flags: ${flags.join("; ")}` : null,
      outside.length ? `⚠ Outside the booked dates: ${outside.map((f) => f.name).join(", ")}` : null,
      missing.length ? `Still missing: ${missing.join("; ")}` : "Complete.",
    ].filter(Boolean).join("\n");
    const summary = await writeText(ctx, { policies: POLICIES, facts: { brief: template }, task: "Tidy this brief summary for the event manager. Keep every fact and flag; add nothing.", template, clientFacing: false, maxTokens: 600 });
    await db.update("wedding_briefs", { wedding_id: weddingId }, { status: "submitted" });
    const approvalId = await requestApproval(ctx, { kind: BRIEF_GATE.reviewApproval, weddingId, title: `Review the brief for ${w.title}`, summary: missing.length ? `${missing.length} gap(s) to fill` : "Complete", payload: { body: summary.body, missing: missing as unknown as Json, flags: flags as unknown as Json, outside_dates: outside.map((f) => f.name) as unknown as Json } });
    if (missing.length && w.primary_contact_id) {
      const [c] = await db.select<{ full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: w.primary_contact_id } });
      if (c) {
        const ask = `Namaste ${c.full_name.split(" ")[0]}, thank you for your brief! To plan everything beautifully, could you add ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? " and a couple of other details" : ""} in your portal when you have a moment?\n\nWarmly,\nTeam Wiwaha`;
        await proposeClientMessage(ctx, { channel: c.phone_e164 ? "whatsapp" : "email", to: c.phone_e164 ?? c.email, weddingId, approvalKind: BRIEF_GATE.messageApproval, title: `Brief follow-up for ${w.title}`, body: ask });
      }
    }
    await ctx.log({ action: "brief_submitted", status: "gated", weddingId, input: { functions: functions.length }, output: { missing, flags, approval_id: approvalId } as Json, model: summary.model, inputTokens: summary.inputTokens, outputTokens: summary.outputTokens, costUsdMicros: summary.costUsdMicros });
    return { missing, approvalId };
  });
}

export async function onBriefDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ reviewed: boolean }>> {
  return runAgent(deps, BRIEF, { action: "brief_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Close a brief review" }, async (ctx) => {
    const db = agentDb(ctx, BRIEF_TOOLS);
    const [a] = await db.select<{ wedding_id: string | null; decided_by: string | null }>("approvals", { where: { id: approvalId } });
    if (!a?.wedding_id) return { reviewed: false };
    const ok = status !== "rejected";
    await db.update("wedding_briefs", { wedding_id: a.wedding_id }, ok ? { status: "reviewed", reviewed_by: a.decided_by, reviewed_at: ctx.now.toISOString() } : { status: "draft" });
    if (ok) {
      await db.update("wedding_stages", { wedding_id: a.wedding_id, key: "brief" }, { status: "done", completed_at: ctx.now.toISOString() });
      // Functions and timings are settled: the Planner can lay out the run-of-show.
      await db.insert("agent_tasks", { kind: "brief_reviewed", from_agent: BRIEF, wedding_id: a.wedding_id, payload: {} });
    }
    await ctx.log({ action: "brief_decided", status: "ok", weddingId: a.wedding_id, input: { status }, output: { reviewed: ok } });
    return { reviewed: ok };
  });
}
