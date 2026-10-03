import type { Json } from "@wiwaha/db";
import { addDays, formatDateIST } from "@wiwaha/db";
import { where } from "../../framework/db";
import { agentDb, alertStaff, deliver, istDate, istInstant, requestApproval } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { PLANNER_GATE } from "./gate";
import { PLANNER_TOOLS } from "./tools";

export const PLANNER = "planner";
const PLAN_KEY = "standard_wedding";

interface Template { id: string; t_minus_days: number | null; title: string; description: string | null; default_role: string | null; priority: string; proof_kind: string; buffer_hours: number; sort: number }
interface Person { id: string; full_name: string; role: string }

/** The day a T-minus step is due: T-n before the first day, T0 the first day, T+n after the last day. */
export function dueDateFor(t: number, eventStart: string, eventEnd: string): string {
  return t > 0 ? addDays(eventStart, -t) : t === 0 ? eventStart : addDays(eventEnd, -t);
}

/** Planning started: the full T-minus plan from the templates, each step with an owner and a date. */
export async function generatePlan(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ created: number; skipped: number }>> {
  return runAgent(deps, PLANNER, { action: "generate_plan", weddingId, input: { wedding_id: weddingId }, fallbackTitle: "Create the T-minus plan" }, async (ctx) => {
    const db = agentDb(ctx, PLANNER_TOOLS);
    const [w] = await db.select<{ id: string; title: string; event_start: string; event_end: string; event_manager_id: string | null }>("weddings", { where: { id: weddingId } });
    if (!w) throw new Error("Wedding not found");
    const templates = await db.select<Template>("task_templates", { where: { plan_key: PLAN_KEY, active: true, scope: "wedding" }, order: [{ column: "sort" }] });
    const existing = await db.select<{ template_id: string | null }>("tasks", { where: { wedding_id: weddingId, template_id: where.notNull() } });
    const people = await db.select<Person>("profiles", { where: { active: true }, order: [{ column: "full_name" }] });
    const ownerFor = (role: string | null): Person | null =>
      role === "event_manager" && w.event_manager_id ? people.find((p) => p.id === w.event_manager_id) ?? null : people.find((p) => p.role === role) ?? null;
    const today = istDate(ctx.now);
    let created = 0, skipped = 0;
    for (const t of templates) {
      if (existing.some((e) => e.template_id === t.id)) { skipped++; continue; }
      const tm = t.t_minus_days ?? 0;
      const day = dueDateFor(tm, w.event_start, w.event_end);
      const owner = ownerFor(t.default_role);
      await db.insert("tasks", {
        scope: "wedding", wedding_id: weddingId, template_id: t.id, title: t.title, description: t.description,
        owner_id: owner?.id ?? null, owner_role: t.default_role, t_minus_days: tm, buffer_hours: t.buffer_hours,
        due_at: istInstant(day < today ? today : day, tm === 0 ? "08:00" : "10:00"), priority: t.priority, proof_kind: t.proof_kind, created_by_agent: PLANNER,
      });
      created++;
    }
    if (created) await alertStaff(deps, { userIds: w.event_manager_id ? [w.event_manager_id] : undefined, role: w.event_manager_id ? undefined : "event_manager", title: `T-minus plan ready: ${w.title}`, body: `${created} steps from T-90 to T+1 are on people's task lists. Edit owners or dates in the Wedding Room.`, link: `/team/weddings/${weddingId}`, weddingId });
    await ctx.log({ action: "generate_plan", status: "ok", weddingId, input: { plan_key: PLAN_KEY }, output: { created, skipped } });
    return { created, skipped };
  });
}

const hhmm = (base: string, offset: number) => {
  const [h, m] = base.split(":").map(Number);
  const mins = (((h ?? 0) * 60 + (m ?? 0) + offset) % 1440 + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
};

/** Ceremonies started (or functions changed): run-of-show per function, then the event manager approves sharing it. */
export async function buildRunOfShow(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ items: number; approvalId: string | null }>> {
  return runAgent(deps, PLANNER, { action: "build_run_of_show", weddingId, input: {}, fallbackTitle: "Draft the run-of-show" }, async (ctx) => {
    const db = agentDb(ctx, PLANNER_TOOLS);
    const [w] = await db.select<{ title: string }>("weddings", { where: { id: weddingId } });
    const fns = await db.select<{ id: string; type: string; name: string; date: string; start_time: string | null }>("event_functions", { where: { wedding_id: weddingId }, order: [{ column: "date" }, { column: "start_time" }] });
    const have = await db.select<{ function_id: string }>("run_of_show_items", { where: { wedding_id: weddingId } });
    const bookings = await db.select<{ vendor_id: string; status: string }>("vendor_bookings", { where: { wedding_id: weddingId, status: where.in(["requested", "confirmed"]) } });
    const vendors = bookings.length ? await db.select<{ id: string; category: string; name: string }>("vendors", { where: { id: where.in(bookings.map((b) => b.vendor_id)) } }) : [];
    let items = 0;
    const lines: string[] = [];
    for (const fn of fns) {
      if (!fn.start_time || have.some((h) => h.function_id === fn.id)) continue;
      const tpl = await db.select<{ offset_minutes: number; duration_minutes: number | null; title: string; owner_label: string | null; vendor_category: string | null; sort: number }>("run_of_show_templates", { where: { function_type: fn.type, active: true }, order: [{ column: "offset_minutes" }, { column: "sort" }] });
      const start = fn.start_time.slice(0, 5);
      const rows = tpl.map((r, i) => {
        const v = r.vendor_category ? vendors.find((x) => x.category === r.vendor_category) : undefined;
        return { wedding_id: weddingId, function_id: fn.id, starts_at: hhmm(start, r.offset_minutes), ends_at: r.duration_minutes ? hhmm(start, r.offset_minutes + r.duration_minutes) : null, title: r.title, owner_label: v ? `${r.owner_label ?? ""} (${v.name})`.trim() : r.owner_label, vendor_id: v?.id ?? null, sort: (i + 1) * 10, created_by_agent: PLANNER };
      });
      if (rows.length) await db.insert("run_of_show_items", rows);
      items += rows.length;
      lines.push(`${fn.name} · ${formatDateIST(fn.date, { weekday: "short", day: "numeric", month: "short" })}`, ...rows.map((r) => `  ${r.starts_at}${r.ends_at ? `–${r.ends_at}` : ""}  ${r.title}${r.owner_label ? ` · ${r.owner_label}` : ""}`));
    }
    const approvalId = items ? await requestApproval(ctx, { kind: PLANNER_GATE.runOfShowApproval, weddingId, title: `Run-of-show for ${w?.title ?? "a wedding"}`, summary: `${items} items across ${new Set(lines.filter((l) => !l.startsWith("  "))).size} functions. Approve to share with staff and vendors.`, payload: { body: lines.join("\n") } }) : null;
    await ctx.log({ action: "build_run_of_show", status: approvalId ? "gated" : "ok", weddingId, input: { functions: fns.length }, output: { items, approval_id: approvalId } });
    return { items, approvalId };
  });
}

/** Run-of-show approved: share it with the estate team and the vendors. */
export async function onRunOfShowDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ shared: number }>> {
  return runAgent(deps, PLANNER, { action: "run_of_show_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Share the run-of-show" }, async (ctx) => {
    const db = agentDb(ctx, PLANNER_TOOLS);
    const [a] = await db.select<{ wedding_id: string | null; kind: string; payload: { body?: string }; edited_payload: { body?: string } | null }>("approvals", { where: { id: approvalId } });
    if (!a?.wedding_id || a.kind !== PLANNER_GATE.runOfShowApproval || status === "rejected") return { shared: 0 };
    const body = a.edited_payload?.body ?? a.payload.body ?? "";
    const [w] = await db.select<{ title: string }>("weddings", { where: { id: a.wedding_id } });
    await alertStaff(deps, { role: "staff", title: `Run-of-show: ${w?.title ?? ""}`, body: body.slice(0, 900), link: "/team/tasks", weddingId: a.wedding_id, whatsapp: true });
    const bookings = await db.select<{ vendor_id: string }>("vendor_bookings", { where: { wedding_id: a.wedding_id, status: "confirmed" } });
    const vendors = bookings.length ? await db.select<{ email: string | null; name: string }>("vendors", { where: { id: where.in(bookings.map((b) => b.vendor_id)) } }) : [];
    let shared = 0;
    for (const v of vendors) {
      if (!v.email) continue;
      await deliver(deps, { kind: "email", to: v.email, subject: `Run-of-show: ${w?.title ?? "Wiwaha wedding"}`, body: `Dear ${v.name},\n\nHere is the approved run-of-show. Please plan your team's arrival around it.\n\n${body}\n\nThank you,\nTeam Wiwaha`, weddingId: a.wedding_id, subjectTable: "approvals", subjectId: approvalId });
      shared++;
    }
    await ctx.log({ action: "run_of_show_decided", status: "ok", weddingId: a.wedding_id, input: { status }, output: { shared } as Json });
    return { shared };
  });
}
