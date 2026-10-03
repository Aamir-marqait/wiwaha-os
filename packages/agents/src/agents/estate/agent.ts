import type { Json } from "@wiwaha/db";
import { addDays, rupees } from "@wiwaha/db";
import { where } from "../../framework/db";
import { agentDb, alertStaff, istDate, istInstant, requestApproval } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { ESTATE_GATE } from "./gate";
import { ESTATE_TOOLS } from "./tools";

export const ESTATE = "estate";
const OPEN_TASK = where.in(["todo", "in_progress", "blocked"]);
const OPEN_PURCHASE = where.in(["requested", "pending_approval", "approved", "ordered"]);

interface Schedule { id: string; name: string; category: string; frequency_days: number; last_done_on: string | null; next_due_on: string | null; owner_id: string | null; active: boolean }
interface Item { id: string; name: string; category: string; quantity: number; unit: string; reorder_level: number; unit_cost_paise: number | null }

/** Daily: roll finished maintenance forward, raise tasks that are due, and reorder low stock. */
export async function estateSweep(deps: AgentDeps): Promise<RunOutcome<{ rolled: number; tasks: number; lowStock: number; approvals: number }>> {
  return runAgent(deps, ESTATE, { action: "estate_sweep", input: {}, fallbackTitle: "Daily estate check" }, async (ctx) => {
    const db = agentDb(ctx, ESTATE_TOOLS);
    const today = istDate(ctx.now);
    const schedules = await db.select<Schedule>("maintenance_schedules", { where: { active: true } });
    let rolled = 0, tasks = 0, lowStock = 0, approvals = 0;

    for (const s of schedules) {
      // 1. Done since we last rolled? Move the schedule forward from the completion date.
      const done = await db.select<{ completed_at: string | null }>("tasks", { where: { maintenance_id: s.id, status: "done" }, order: [{ column: "completed_at", ascending: false }], limit: 1 });
      const doneOn = done[0]?.completed_at ? istDate(new Date(done[0].completed_at)) : null;
      if (doneOn && (!s.last_done_on || doneOn > s.last_done_on)) {
        s.last_done_on = doneOn;
        s.next_due_on = addDays(doneOn, s.frequency_days);
        await db.update("maintenance_schedules", { id: s.id }, { last_done_on: s.last_done_on, next_due_on: s.next_due_on });
        rolled++;
      }
      // 2. Due within two days and no open task: raise one (photo proof).
      const due = s.next_due_on ?? (s.last_done_on ? addDays(s.last_done_on, s.frequency_days) : today);
      if (due > addDays(today, 2)) continue;
      const open = await db.select("tasks", { where: { maintenance_id: s.id, status: OPEN_TASK } });
      if (open.length) continue;
      await db.insert("tasks", { scope: "estate", maintenance_id: s.id, title: `${s.name}`, description: `Every ${s.frequency_days} days (${s.category.replace("_", " ")}). Add a photo when done.`, owner_id: s.owner_id, owner_role: "staff", due_at: istInstant(due < today ? today : due, "10:00"), priority: due < today ? "high" : "normal", proof_kind: "photo", created_by_agent: ESTATE });
      tasks++;
    }

    // 3. Low stock → a purchase request; above the limit, Prashanth approves.
    const rules = ctx.book.get("estate.purchases");
    const items = await db.select<Item>("inventory_items", {});
    for (const it of items.filter((i) => i.quantity <= i.reorder_level)) {
      const open = await db.select("purchase_requests", { where: { inventory_item_id: it.id, status: OPEN_PURCHASE } });
      if (open.length) continue;
      lowStock++;
      const qty = Math.max(1, Math.ceil(it.reorder_level * 1.5 - it.quantity));
      const amount = it.unit_cost_paise ? qty * it.unit_cost_paise : 0;
      const needsOwner = amount > rules.owner_approval_above_paise;
      const [pr] = await db.insert<{ id: string }>("purchase_requests", { item: it.name, inventory_item_id: it.id, quantity: qty, amount_paise: amount, reason: `Low stock: ${it.quantity} ${it.unit} left (reorder at ${it.reorder_level}).`, status: needsOwner ? "pending_approval" : "requested", requested_by_agent: ESTATE });
      if (needsOwner) {
        const approvalId = await requestApproval(ctx, { kind: ESTATE_GATE.purchaseApproval, title: `Purchase: ${qty} ${it.unit} of ${it.name}`, summary: `${rupees(amount)} (above the ${rupees(rules.owner_approval_above_paise)} limit)`, payload: { purchase_request_id: pr!.id, body: `${it.name}: ${qty} ${it.unit} at ${rupees(it.unit_cost_paise)} each = ${rupees(amount)}` } });
        await db.update("purchase_requests", { id: pr!.id }, { approval_id: approvalId });
        approvals++;
      }
      await alertStaff(deps, { role: rules.low_stock_alert_role, title: `Low stock: ${it.name}`, body: `${it.quantity} ${it.unit} left. ${needsOwner ? "A purchase request is waiting for Prashanth." : `Purchase request raised for ${qty} ${it.unit}${amount ? ` (${rupees(amount)})` : ""}.`}`, link: "/team/estate" });
    }
    await ctx.log({ action: "estate_sweep", status: approvals ? "gated" : "ok", input: { today }, output: { rolled, tasks, low_stock: lowStock, approvals }, policyKeys: ["estate.purchases"], policyVersions: ctx.book.versions(["estate.purchases"]) });
    return { rolled, tasks, lowStock, approvals };
  });
}

/** Prashanth decided a purchase. */
export async function onPurchaseDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ approved: boolean }>> {
  return runAgent(deps, ESTATE, { action: "purchase_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Record a purchase decision" }, async (ctx) => {
    const db = agentDb(ctx, ESTATE_TOOLS);
    const [pr] = await db.select<{ id: string; item: string }>("purchase_requests", { where: { approval_id: approvalId } });
    if (!pr) return { approved: false };
    const approved = status !== "rejected";
    await db.update("purchase_requests", { id: pr.id }, { status: approved ? "approved" : "rejected" });
    await alertStaff(deps, { role: "staff", title: `Purchase ${approved ? "approved" : "declined"}: ${pr.item}`, body: approved ? "Go ahead and order it." : "Prashanth declined this purchase.", link: "/team/estate" });
    await ctx.log({ action: "purchase_decided", status: "ok", input: { status }, output: { approved } as Json });
    return { approved };
  });
}
