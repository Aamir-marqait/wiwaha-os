import type { Json } from "@wiwaha/db";
import { addDays, formatDateIST } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { where, type Db } from "../../framework/db";
import { agentDb, alertStaff, istInstant, proposeClientMessage } from "../../framework/kit";
import { runAgent, type RunContext, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { workOrderCost, workOrderFor, type WorkOrderItem, type WorkOrderLine } from "../../domain/work-orders";
import { VENDOR_GATE } from "./gate";
import { VENDOR_TOOLS } from "./tools";

export const VENDOR_COORDINATOR = "vendor_coordinator";
const POLICIES: readonly PolicyKey[] = ["vendors.lockin", "decor.providers"];

interface Vendor { id: string; name: string; category: string; email: string | null; contact_name: string | null; preferred: boolean; designated_planner: boolean; active: boolean; rating: number | null }
interface Booking { id: string; vendor_id: string; wedding_id: string; status: string; reply_token: string; chase_count: number; last_chased_at: string | null; requested_at: string; replied_at: string | null; work_order?: WorkOrderItem[] | null; checklist_created_at?: string | null; work_order_approved_at?: string | null }

async function weddingFacts(db: Db, weddingId: string) {
  const [w] = await db.select<{ id: string; title: string; code: string; event_start: string; event_end: string; guest_count: number | null; event_manager_id: string | null }>("weddings", { where: { id: weddingId } });
  const fns = await db.select<{ id: string; name: string; date: string; start_time: string | null; guest_count: number | null }>("event_functions", { where: { wedding_id: weddingId }, order: [{ column: "date" }] });
  return { w: w!, fns };
}

function email(ctx: RunContext, v: Vendor, b: Booking, w: { title: string; code: string; event_start: string; event_end: string }, fns: { name: string; date: string; start_time: string | null; guest_count: number | null }[], chase = 0) {
  const link = `${ctx.deps.channels?.appUrl ?? ""}/vendor/reply/${b.reply_token}`;
  const schedule = fns.map((f) => `- ${f.name}: ${formatDateIST(f.date, { weekday: "short", day: "numeric", month: "short" })}${f.start_time ? ` ${f.start_time.slice(0, 5)}` : ""}${f.guest_count ? `, ${f.guest_count} guests` : ""}`).join("\n");
  return chase
    ? `Dear ${v.contact_name ?? v.name},\n\nA gentle reminder about ${w.title}'s wedding at Wiwaha by Praman (${formatDateIST(w.event_start)}–${formatDateIST(w.event_end)}). Could you confirm your availability here: ${link}\n\nThank you,\nTeam Wiwaha`
    : `Dear ${v.contact_name ?? v.name},\n\nWe'd love you to join ${w.title}'s wedding at Wiwaha by Praman (${w.code}), ${formatDateIST(w.event_start)} to ${formatDateIST(w.event_end)}, for ${v.category}.\n\n${schedule}${b.work_order?.length ? `\n\nWork order:\n${b.work_order.map((i) => `- ${i.description}${i.quantity !== 1 ? ` × ${i.quantity}` : ""}`).join("\n")}` : ""}\n\nPlease confirm or decline here: ${link}\n\nThank you,\nTeam Wiwaha`;
}

/** Lines of the quote the couple approved: what the work orders are made from. */
async function approvedLines(db: Db, weddingId: string): Promise<WorkOrderLine[]> {
  const [q] = await db.select<{ id: string }>("quotes", { where: { wedding_id: weddingId, status: "client_approved" }, order: [{ column: "version", ascending: false }], limit: 1 });
  if (!q) return [];
  const lines = await db.select<Omit<WorkOrderLine, "unit_cost_paise"> & { id: string }>("quote_lines", { where: { quote_id: q.id }, order: [{ column: "sort" }] });
  const costs = lines.length ? await db.select<{ id: string; unit_cost_paise: number | null }>("quote_line_costs", { where: { id: where.in(lines.map((l) => l.id)) } }) : [];
  return lines.map((l) => ({ ...l, unit_cost_paise: costs.find((c) => c.id === l.id)?.unit_cost_paise ?? null }));
}

/** Quote approved: ask one preferred vendor per category to lock the dates, each with its work order. */
export async function lockVendors(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ requested: number }>> {
  return runAgent(deps, VENDOR_COORDINATOR, { action: "lock_vendors", weddingId, input: {}, fallbackTitle: "Lock vendor dates" }, async (ctx) => {
    const db = agentDb(ctx, VENDOR_TOOLS);
    const { w, fns } = await weddingFacts(db, weddingId);
    const decor = ctx.book.get("decor.providers");
    const vendors = await db.select<Vendor>("vendors", { where: { active: true, preferred: true } });
    const existing = await db.select<Booking>("vendor_bookings", { where: { wedding_id: weddingId } });
    const categories = [...new Set(vendors.map((v) => v.category))];
    const lines = await approvedLines(db, weddingId);
    let requested = 0;
    for (const cat of categories) {
      if (existing.some((b) => vendors.find((v) => v.id === b.vendor_id)?.category === cat && b.status !== "declined")) continue;
      const pool = vendors.filter((v) => v.category === cat && (cat !== "decor" || (decor.allowed.includes("designated_planner") && v.designated_planner)));
      const v = pool.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
      if (!v) continue;
      const order = workOrderFor(cat, lines, fns);
      // Drafted only: a work order reaches the vendor after one of us approves it (approve_work_order).
      await db.insert<Booking>("vendor_bookings", { vendor_id: v.id, wedding_id: weddingId, status: "requested", brief: `${w.title}: ${fns.map((f) => f.name).join(", ")}`, work_order: order, amount_paise: workOrderCost(order) });
      requested++;
    }
    if (requested) await alertStaff(deps, { userIds: w.event_manager_id ? [w.event_manager_id] : undefined, role: w.event_manager_id ? undefined : "owner", title: `${requested} vendor work order${requested === 1 ? "" : "s"} to approve: ${w.title}`, body: "Check each work order and approve it before it goes to the vendor.", link: "/team/vendors", weddingId });
    await db.update("wedding_stages", { wedding_id: weddingId, key: "vendors" }, { status: "in_progress", owner_label: "Your event manager and the Vendor Coordinator" });
    await ctx.log({ action: "lock_vendors", status: "ok", weddingId, input: {}, output: { requested, categories } as Json, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { requested };
  });
}

/**
 * One of us approved a work order: it goes to the vendor now. A person
 * approved it, so the email is not gated again; it waits in "To send" when
 * email isn't live yet.
 */
export async function onWorkOrderApproved(deps: AgentDeps, bookingId: string): Promise<RunOutcome<{ sent: boolean }>> {
  return runAgent(deps, VENDOR_COORDINATOR, { action: "work_order_approved", input: { booking_id: bookingId }, fallbackTitle: "Send an approved work order" }, async (ctx) => {
    const db = agentDb(ctx, VENDOR_TOOLS);
    const [b] = await db.select<Booking>("vendor_bookings", { where: { id: bookingId } });
    if (!b || !b.work_order_approved_at || b.status !== "requested") return { sent: false };
    const [v] = await db.select<Vendor>("vendors", { where: { id: b.vendor_id } });
    const { w, fns } = await weddingFacts(db, b.wedding_id);
    if (!v?.email) {
      await alertStaff(deps, { userIds: w.event_manager_id ? [w.event_manager_id] : undefined, role: w.event_manager_id ? undefined : "event_manager", title: `Call ${v?.name ?? "the vendor"} with the work order`, body: `${w.title}: there's no email for this vendor. Share the work order by phone or WhatsApp.`, link: `/team/weddings/${b.wedding_id}?tab=vendors`, weddingId: b.wedding_id });
      return { sent: false };
    }
    await deps.store.createMessage({ weddingId: b.wedding_id, channel: "email", direction: "outbound", status: "approved", authorKind: "agent", agentKey: VENDOR_COORDINATOR, toAddress: v.email, subject: `Work order: ${w.title} (${formatDateIST(w.event_start)})`, body: email(ctx, v, b, w, fns), clientVisible: false });
    await db.update("vendor_bookings", { id: b.id }, { requested_at: ctx.now.toISOString() });
    await ctx.log({ action: "work_order_approved", status: "ok", weddingId: b.wedding_id, subjectTable: "vendor_bookings", subjectId: b.id, input: { booking_id: bookingId }, output: { to: v.email } });
    return { sent: true };
  });
}

/** A vendor confirmed or declined through their link. */
export async function onVendorReplied(deps: AgentDeps, bookingId: string): Promise<RunOutcome<{ allConfirmed: boolean }>> {
  return runAgent(deps, VENDOR_COORDINATOR, { action: "vendor_replied", input: { booking_id: bookingId }, fallbackTitle: "Handle a vendor's reply" }, async (ctx) => {
    const db = agentDb(ctx, VENDOR_TOOLS);
    const [b] = await db.select<Booking>("vendor_bookings", { where: { id: bookingId } });
    if (!b) throw new Error("Booking not found");
    const { w, fns } = await weddingFacts(db, b.wedding_id);
    if (b.status === "declined") {
      const [declined] = await db.select<Vendor>("vendors", { where: { id: b.vendor_id } });
      const asked = await db.select<Booking>("vendor_bookings", { where: { wedding_id: b.wedding_id } });
      const next = (await db.select<Vendor>("vendors", { where: { active: true, category: declined?.category ?? "" } })).filter((v) => !asked.some((a) => a.vendor_id === v.id)).sort((x, y) => Number(y.preferred) - Number(x.preferred) || (y.rating ?? 0) - (x.rating ?? 0))[0];
      if (next && next.email) {
        await db.insert<Booking>("vendor_bookings", { vendor_id: next.id, wedding_id: b.wedding_id, status: "requested", brief: `${w.title}: ${fns.map((f) => f.name).join(", ")}`, work_order: b.work_order ?? [], amount_paise: workOrderCost(b.work_order ?? []) });
        await alertStaff(deps, { userIds: w.event_manager_id ? [w.event_manager_id] : undefined, role: w.event_manager_id ? undefined : "owner", title: `${declined?.name ?? "A vendor"} declined: approve the work order for ${next.name}`, body: `${w.title}: the next ${next.category} vendor is ready once you approve.`, link: "/team/vendors", weddingId: b.wedding_id });
      } else {
        await alertStaff(deps, { userIds: w.event_manager_id ? [w.event_manager_id] : undefined, role: w.event_manager_id ? undefined : VENDOR_GATE.escalateTo, title: `No ${declined?.category ?? ""} vendor available for ${w.title}`, body: `${declined?.name ?? "The vendor"} declined and there's no other vendor in this category.`, link: `/team/weddings/${b.wedding_id}`, weddingId: b.wedding_id, whatsapp: true });
      }
    }
    // Accepted: one checklist task per work-order item, owned by the event manager.
    let checklist = 0;
    if (b.status === "confirmed" && !b.checklist_created_at) {
      const [v] = await db.select<Vendor>("vendors", { where: { id: b.vendor_id } });
      const items: WorkOrderItem[] = b.work_order?.length ? b.work_order : [{ description: `${v?.category ?? "Vendor"} for all functions`, quantity: 1, function_id: null, function_name: null, date: null, unit_cost_paise: null }];
      await db.insert("tasks", items.map((i) => ({
        scope: "wedding", wedding_id: b.wedding_id, title: `Check with ${v?.name ?? "the vendor"}: ${i.description}`,
        description: `From ${v?.name ?? "the vendor"}'s accepted work order${i.function_name ? ` for the ${i.function_name}` : ""}. Confirm it's ready, then tick.`,
        owner_id: w.event_manager_id, owner_role: "event_manager", due_at: istInstant(addDays(i.date ?? w.event_start, -2), "11:00"),
        priority: "normal", proof_kind: "tick", created_by_agent: VENDOR_COORDINATOR,
      })));
      await db.update("vendor_bookings", { id: b.id }, { checklist_created_at: ctx.now.toISOString() });
      checklist = items.length;
    }
    const all = await db.select<Booking>("vendor_bookings", { where: { wedding_id: b.wedding_id, status: where.neq("declined") } });
    const allConfirmed = all.length > 0 && all.every((x) => x.status === "confirmed");
    if (allConfirmed) {
      await db.update("wedding_stages", { wedding_id: b.wedding_id, key: "vendors" }, { status: "done", completed_at: ctx.now.toISOString() });
      await alertStaff(deps, { userIds: w.event_manager_id ? [w.event_manager_id] : undefined, role: w.event_manager_id ? undefined : "event_manager", title: `Vendors locked for ${w.title}`, body: `All ${all.length} vendors confirmed.`, link: `/team/weddings/${b.wedding_id}`, weddingId: b.wedding_id });
    }
    await ctx.log({ action: "vendor_replied", status: "ok", weddingId: b.wedding_id, input: { booking_id: bookingId, status: b.status }, output: { all_confirmed: allConfirmed, checklist } });
    return { allConfirmed };
  });
}

/** Chase vendors who haven't replied (policy cadence), then hand to the event manager. */
export async function chaseVendors(deps: AgentDeps): Promise<RunOutcome<{ chased: number; escalated: number }>> {
  return runAgent(deps, VENDOR_COORDINATOR, { action: "chase_vendors", input: {}, fallbackTitle: "Chase vendors for replies" }, async (ctx) => {
    const db = agentDb(ctx, VENDOR_TOOLS);
    const rules = ctx.book.get("vendors.lockin");
    const cutoff = ctx.now.getTime() - rules.chase_after_hours * 3600_000;
    const open = (await db.select<Booking>("vendor_bookings", { where: { status: "requested", replied_at: where.isNull() } })).filter((b) => !!b.work_order_approved_at);
    let chased = 0, escalated = 0;
    for (const b of open) {
      if (Date.parse(b.last_chased_at ?? b.work_order_approved_at ?? b.requested_at) > cutoff) continue;
      const [v] = await db.select<Vendor>("vendors", { where: { id: b.vendor_id } });
      const { w, fns } = await weddingFacts(db, b.wedding_id);
      if (b.chase_count < rules.max_chases && v?.email) {
        await proposeClientMessage(ctx, { channel: "email", to: v.email, subject: `Reminder: ${w.title}`, body: email(ctx, v, b, w, fns, b.chase_count + 1), weddingId: b.wedding_id, approvalKind: VENDOR_GATE.messageApproval, title: `Chase ${b.chase_count + 1} to ${v.name}`, clientVisible: false });
        await db.update("vendor_bookings", { id: b.id }, { chase_count: b.chase_count + 1, last_chased_at: ctx.now.toISOString() });
        chased++;
      } else if (rules.escalate_after_chases && b.chase_count === rules.max_chases) {
        await alertStaff(deps, { userIds: w.event_manager_id ? [w.event_manager_id] : undefined, role: w.event_manager_id ? undefined : "event_manager", title: `${v?.name ?? "A vendor"} hasn't replied`, body: `${rules.max_chases} reminders sent for ${w.title}. Please call them.`, link: `/team/weddings/${b.wedding_id}`, weddingId: b.wedding_id, whatsapp: true });
        await db.update("vendor_bookings", { id: b.id }, { chase_count: b.chase_count + 1, last_chased_at: ctx.now.toISOString() });
        escalated++;
      }
    }
    await ctx.log({ action: "chase_vendors", status: "ok", input: {}, output: { chased, escalated } });
    return { chased, escalated };
  });
}
