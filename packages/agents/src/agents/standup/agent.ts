import { addDays, formatDateTimeIST } from "@wiwaha/db";
import { where, type Db } from "../../framework/db";
import { agentDb, alertStaff, istClock, istDate, istInstant } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { STANDUP_TOOLS } from "./tools";

export const STANDUP = "standup";
const STAFF_ROLES = ["owner", "sales", "event_manager", "staff", "accounts"];
const PRIORITY: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

interface Task { id: string; title: string; owner_id: string | null; owner_role: string | null; due_at: string | null; priority: string; status: string; wedding_id: string | null; buffer_hours: number; completed_at: string | null; escalated_at: string | null; escalated_owner_at: string | null; escalated_to: string | null; completed_by: string | null }
interface Person { id: string; full_name: string; role: string }

const line = (t: Task) => `• ${t.title}${t.due_at ? ` (${formatDateTimeIST(t.due_at)})` : ""}${t.priority === "urgent" ? " [urgent]" : ""}`;
const mine = (p: Person) => (t: Task) => t.owner_id === p.id || (!t.owner_id && t.owner_role === p.role);

async function saveOnce(db: Db, row: { kind: "morning" | "evening"; for_date: string; recipient_id: string; title: string; content_md: string }): Promise<boolean> {
  const existing = await db.select("briefs", { where: { kind: row.kind, for_date: row.for_date, recipient_id: row.recipient_id } });
  if (existing.length) return false;
  try { await db.insert("briefs", row); return true; } catch { return false; }
}

/** 8:30 am (policy "briefs.schedule"): each person's day, and a team summary for Prashanth. */
export async function morningStandup(deps: AgentDeps): Promise<RunOutcome<{ sent: number; skipped?: string }>> {
  return runAgent(deps, STANDUP, { action: "morning_standup", input: {}, fallbackTitle: "Send the morning stand-up" }, async (ctx) => {
    const db = agentDb(ctx, STANDUP_TOOLS);
    const at = ctx.book.get("briefs.schedule").morning;
    if (istClock(ctx.now) < at) return { sent: 0, skipped: `before ${at}` };
    const today = istDate(ctx.now);
    const endOfDay = istInstant(addDays(today, 1), "00:00");
    const open = await db.select<Task>("tasks", { where: { status: where.in(["todo", "in_progress", "blocked"]), due_at: where.lt(endOfDay) }, order: [{ column: "due_at" }] });
    const people = (await db.select<Person>("profiles", { where: { active: true, role: where.in(STAFF_ROLES) } }));
    const pending = await db.select<{ id: string }>("approvals", { where: { status: "pending" } });
    let sent = 0;
    for (const p of people) {
      const list = open.filter(mine(p)).sort((a, b) => (PRIORITY[a.priority] ?? 9) - (PRIORITY[b.priority] ?? 9));
      const overdue = list.filter((t) => t.due_at && t.due_at < ctx.now.toISOString());
      const todayList = list.filter((t) => !overdue.includes(t));
      const team = p.role === "owner" ? open.filter((t) => t.due_at && t.due_at < ctx.now.toISOString()) : [];
      if (!list.length && p.role !== "owner") continue;
      const first = p.full_name.split(" ")[0];
      const body = [
        `Good morning ${first}.`,
        todayList.length ? `Today (${todayList.length}):\n${todayList.slice(0, 8).map(line).join("\n")}` : "Nothing due today.",
        overdue.length ? `Overdue (${overdue.length}):\n${overdue.slice(0, 5).map(line).join("\n")}` : null,
        p.role === "owner" ? `Team: ${open.length} tasks due by tonight, ${team.length} overdue across the team, ${pending.length} approvals waiting for you.` : null,
      ].filter(Boolean).join("\n\n");
      if (!(await saveOnce(db, { kind: "morning", for_date: today, recipient_id: p.id, title: `Stand-up for ${first}`, content_md: body }))) continue;
      await alertStaff(deps, { userIds: [p.id], title: `Good morning, ${first}`, body, link: p.role === "owner" ? "/team" : "/team/tasks", whatsapp: true, agentKey: STANDUP });
      sent++;
    }
    await ctx.log({ action: "morning_standup", status: "ok", input: { today }, output: { sent }, policyKeys: ["briefs.schedule"], policyVersions: ctx.book.versions(["briefs.schedule"]) });
    return { sent };
  });
}

/** 7 pm: closed, slipped, decisions needed. */
export async function eveningReview(deps: AgentDeps): Promise<RunOutcome<{ sent: number; skipped?: string }>> {
  return runAgent(deps, STANDUP, { action: "evening_review", input: {}, fallbackTitle: "Send the evening review" }, async (ctx) => {
    const db = agentDb(ctx, STANDUP_TOOLS);
    const at = ctx.book.get("briefs.schedule").evening;
    if (istClock(ctx.now) < at) return { sent: 0, skipped: `before ${at}` };
    const today = istDate(ctx.now);
    const start = istInstant(today, "00:00"), end = istInstant(addDays(today, 1), "00:00");
    const closed = await db.select<Task>("tasks", { where: { status: "done", completed_at: where.gte(start) } });
    const slipped = await db.select<Task>("tasks", { where: { status: where.in(["todo", "in_progress", "blocked"]), due_at: where.lt(end) } });
    const people = await db.select<Person>("profiles", { where: { active: true, role: where.in(STAFF_ROLES) } });
    const pending = await db.select<{ id: string; kind: string; title: string }>("approvals", { where: { status: "pending" } });
    let sent = 0;
    for (const p of people) {
      const done = closed.filter((t) => t.completed_by === p.id || mine(p)(t));
      const late = slipped.filter(mine(p));
      const decisions = p.role === "owner" ? pending : p.role === "event_manager" ? pending.filter((a) => ["brief", "client_message", "menu", "moodboard", "vendor_message", "run_of_show", "t_minus_plan"].includes(a.kind)) : [];
      if (!done.length && !late.length && !decisions.length) continue;
      const first = p.full_name.split(" ")[0];
      const body = [
        `Evening review, ${first}.`,
        `Closed today: ${done.length}${done.length ? `\n${done.slice(0, 6).map(line).join("\n")}` : ""}`,
        late.length ? `Slipped (${late.length}):\n${late.slice(0, 6).map(line).join("\n")}` : "Nothing slipped. Thank you!",
        decisions.length ? `Decisions needed (${decisions.length}):\n${decisions.slice(0, 6).map((d) => `• ${d.title}`).join("\n")}` : null,
        p.role === "owner" ? `Team today: ${closed.length} closed, ${slipped.length} slipped.` : null,
      ].filter(Boolean).join("\n\n");
      if (!(await saveOnce(db, { kind: "evening", for_date: today, recipient_id: p.id, title: `Evening review for ${first}`, content_md: body }))) continue;
      await alertStaff(deps, { userIds: [p.id], title: `Evening review, ${first}`, body, link: "/team/tasks", whatsapp: true, agentKey: STANDUP });
      sent++;
    }
    await ctx.log({ action: "evening_review", status: "ok", input: { today }, output: { sent } });
    return { sent };
  });
}

/** Overdue → event manager (after the task's buffer) → Prashanth (policy "tasks.escalation"). */
export async function escalateOverdue(deps: AgentDeps): Promise<RunOutcome<{ toManager: number; toOwner: number }>> {
  return runAgent(deps, STANDUP, { action: "escalate_overdue", input: {}, fallbackTitle: "Escalate overdue tasks" }, async (ctx) => {
    const db = agentDb(ctx, STANDUP_TOOLS);
    const rule = ctx.book.get("tasks.escalation");
    const now = ctx.now.getTime();
    const open = await db.select<Task>("tasks", { where: { status: where.in(["todo", "in_progress", "blocked"]), due_at: where.lt(ctx.now.toISOString()) } });
    const people = await db.select<Person>("profiles", { where: { active: true } });
    const nameOf = (t: Task) => people.find((p) => p.id === t.owner_id)?.full_name ?? (t.owner_role ? `the ${t.owner_role.replace("_", " ")} team` : "unassigned");
    let toManager = 0, toOwner = 0;
    for (const t of open) {
      const due = Date.parse(t.due_at!);
      if (!t.escalated_at && rule.to_event_manager_after_buffer && now > due + t.buffer_hours * 3600_000) {
        const [w] = t.wedding_id ? await db.select<{ title: string; event_manager_id: string | null }>("weddings", { where: { id: t.wedding_id } }) : [];
        const emId = w?.event_manager_id && w.event_manager_id !== t.owner_id ? w.event_manager_id : null;
        await alertStaff(deps, { userIds: emId ? [emId] : undefined, role: emId ? undefined : "event_manager", title: `Overdue: ${t.title}`, body: `${nameOf(t)} · was due ${formatDateTimeIST(t.due_at)}${w ? ` · ${w.title}` : ""}`, link: t.wedding_id ? `/team/weddings/${t.wedding_id}` : "/team/tasks", weddingId: t.wedding_id, whatsapp: true, agentKey: STANDUP });
        await db.update("tasks", { id: t.id }, { escalated_at: ctx.now.toISOString(), escalated_to: "event_manager" });
        toManager++;
      } else if (t.escalated_at && !t.escalated_owner_at && now > Date.parse(t.escalated_at) + rule.to_owner_after_hours * 3600_000) {
        await alertStaff(deps, { role: "owner", title: `Still overdue: ${t.title}`, body: `${nameOf(t)} · due ${formatDateTimeIST(t.due_at)}; the event manager was told ${rule.to_owner_after_hours}h ago.`, link: t.wedding_id ? `/team/weddings/${t.wedding_id}` : "/team/tasks", weddingId: t.wedding_id, whatsapp: true, agentKey: STANDUP });
        await db.update("tasks", { id: t.id }, { escalated_owner_at: ctx.now.toISOString(), escalated_to: "owner" });
        toOwner++;
      }
    }
    await ctx.log({ action: "escalate_overdue", status: "ok", input: {}, output: { to_manager: toManager, to_owner: toOwner }, policyKeys: ["tasks.escalation"], policyVersions: ctx.book.versions(["tasks.escalation"]) });
    return { toManager, toOwner };
  });
}
