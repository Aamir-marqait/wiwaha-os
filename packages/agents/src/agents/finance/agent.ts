import type { Json } from "@wiwaha/db";
import { formatDateIST, rupees } from "@wiwaha/db";
import { invoiceTotals, priceLine, type InvoiceLine } from "../../domain/finance";
import { where } from "../../framework/db";
import { agentDb, alertStaff, claimRun, deliver, istDate, requestApproval } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { FINANCE_GATE } from "./gate";
import { FINANCE_TOOLS } from "./tools";

export const FINANCE = "finance";
const KARNATAKA = "29";

/** Daily: weddings whose last day has passed move to close-out (invoices, inspection, offboarding). */
export async function startCloseOuts(deps: AgentDeps): Promise<RunOutcome<{ started: number }>> {
  return runAgent(deps, FINANCE, { action: "start_close_outs", input: {}, fallbackTitle: "Start close-out after events" }, async (ctx) => {
    const db = agentDb(ctx, FINANCE_TOOLS);
    const today = istDate(ctx.now);
    const ended = await db.select<{ id: string; stage: string }>("weddings", { where: { status: "active", event_end: where.lt(today), stage: where.in(["booking", "onboarding", "planning", "final_payment", "execution"]) } });
    for (const w of ended) {
      await db.update("weddings", { id: w.id }, { stage: "close_out" });
      await db.insert("agent_tasks", [
        { kind: "closeout_due", from_agent: FINANCE, wedding_id: w.id, payload: {} },
        { kind: "offboarding_due", from_agent: FINANCE, wedding_id: w.id, payload: {} },
      ]);
    }
    await ctx.log({ action: "start_close_outs", status: "ok", input: { today }, output: { started: ended.length } });
    return { started: ended.length };
  });
}

/** After the event: final invoice + GST invoice from the approved quote, and the profit report. */
export async function closeOutWedding(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ invoices: string[]; approvalId: string | null; profitPaise: number }>> {
  return runAgent(deps, FINANCE, { action: "close_out", weddingId, input: {}, fallbackTitle: "Prepare final invoices and profit" }, async (ctx) => {
    const db = agentDb(ctx, FINANCE_TOOLS);
    const gst = ctx.book.get("finance.gst");
    const [w] = await db.select<{ id: string; title: string; code: string; contract_value_paise: number | null; primary_contact_id: string | null }>("weddings", { where: { id: weddingId } });
    if (!w) throw new Error("Wedding not found");
    const existing = await db.select<{ number: string; kind: string }>("invoices", { where: { wedding_id: weddingId, status: where.neq("void") } });
    const payments = await db.select<{ status: string; paid_amount_paise: number | null; amount_paise: number }>("payments", { where: { wedding_id: weddingId } });
    const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + (p.paid_amount_paise ?? p.amount_paise), 0);
    const costs = await db.select<{ category: string; amount_paise: number }>("cost_entries", { where: { wedding_id: weddingId } });
    const costTotal = costs.reduce((s, c) => s + c.amount_paise, 0);

    // Lines: the couple's approved quote (latest), GST re-rated from the policy book.
    const [q] = await db.select<{ id: string; version: number }>("quotes", { where: { wedding_id: weddingId, status: where.in(["client_approved", "sent"]) }, order: [{ column: "version", ascending: false }], limit: 1 });
    const qLines = q ? await db.select<{ description: string; quantity: number; unit_price_paise: number; line_total_paise: number; price_book_item_id: string | null; sort: number }>("quote_lines", { where: { quote_id: q.id }, order: [{ column: "sort" }] }) : [];
    const items = qLines.some((l) => l.price_book_item_id) ? await db.select<{ id: string; category: string }>("price_book_items", { where: { id: where.in(qLines.filter((l) => l.price_book_item_id).map((l) => l.price_book_item_id!)) } }) : [];
    const lines: InvoiceLine[] = qLines.length
      ? qLines.map((l) => priceLine({ ...l, category: items.find((i) => i.id === l.price_book_item_id)?.category ?? "services" }, gst.rates_bps))
      : [priceLine({ description: `Venue and services for ${w.title} (as per contract)`, category: "venue", quantity: 1, unit_price_paise: w.contract_value_paise ?? paid }, gst.rates_bps)];
    const intra = gst.state_code === KARNATAKA;
    const t = invoiceTotals(lines, intra);
    const revenueExGst = t.total ? Math.round((paid * t.subtotal) / t.total) : paid;
    const profit = revenueExGst - costTotal;

    const numbers: string[] = [];
    let approvalId: string | null = null;
    if (!existing.some((i) => i.kind === "final")) {
      const finalNo = await db.rpc<string>("next_invoice_number", { p_prefix: gst.invoice_prefix });
      const gstNo = await db.rpc<string>("next_invoice_number", { p_prefix: `${gst.invoice_prefix}-GST` });
      const base = { wedding_id: weddingId, issued_on: istDate(ctx.now), lines: lines as unknown as Json, subtotal_paise: t.subtotal, cgst_paise: t.cgst, sgst_paise: t.sgst, igst_paise: t.igst, total_paise: t.total, amount_paid_paise: paid, balance_paise: t.total - paid, status: "pending_approval" };
      await db.insert("invoices", [{ ...base, kind: "final", number: finalNo }, { ...base, kind: "gst", number: gstNo }]);
      numbers.push(finalNo, gstNo);
      const byCat = Object.entries(costs.reduce<Record<string, number>>((m, c) => ({ ...m, [c.category]: (m[c.category] ?? 0) + c.amount_paise }), {}));
      const report = [
        `Final invoice ${finalNo} and GST invoice ${gstNo} for ${w.title}`,
        `Taxable ${rupees(t.subtotal)} + ${intra ? `CGST ${rupees(t.cgst)} + SGST ${rupees(t.sgst)}` : `IGST ${rupees(t.igst)}`} = ${rupees(t.total)}`,
        `Received ${rupees(paid)} · balance ${rupees(t.total - paid)}`,
        "",
        `Profit: revenue (ex GST) ${rupees(revenueExGst)} − costs ${rupees(costTotal)} = ${rupees(profit)}`,
        ...byCat.map(([c, a]) => `  ${c}: ${rupees(a)}`),
        costs.length ? "" : "  (No cost entries yet: add them in Finance for an accurate profit.)",
      ].join("\n");
      approvalId = await requestApproval(ctx, { kind: FINANCE_GATE.invoiceApproval, weddingId, title: `Final and GST invoices: ${w.title}`, summary: `${rupees(t.total)} · balance ${rupees(t.total - paid)} · profit ${rupees(profit)}`, payload: { body: report, invoice_numbers: numbers } });
      await db.update("invoices", { wedding_id: weddingId, status: "pending_approval" }, { approval_id: approvalId });
    }
    await ctx.log({ action: "close_out", status: approvalId ? "gated" : "ok", weddingId, input: { quote_version: q?.version ?? null }, output: { invoices: numbers, total_paise: t.total, paid_paise: paid, profit_paise: profit } as Json, policyKeys: ["finance.gst"], policyVersions: ctx.book.versions(["finance.gst"]) });
    return { invoices: numbers, approvalId, profitPaise: profit };
  });
}

/** Invoices approved: issue them and email the couple (the approval covers the email). */
export async function onInvoicesDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ issued: number }>> {
  return runAgent(deps, FINANCE, { action: "invoices_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Issue approved invoices" }, async (ctx) => {
    const db = agentDb(ctx, FINANCE_TOOLS);
    const invs = await db.select<{ id: string; wedding_id: string; number: string; kind: string; total_paise: number; balance_paise: number }>("invoices", { where: { approval_id: approvalId } });
    if (!invs.length) return { issued: 0 };
    if (status === "rejected") {
      await db.update("invoices", { approval_id: approvalId }, { status: "void" });
      return { issued: 0 };
    }
    await db.update("invoices", { approval_id: approvalId }, { status: "issued", issued_on: istDate(ctx.now) });
    const [w] = await db.select<{ title: string; primary_contact_id: string | null }>("weddings", { where: { id: invs[0]!.wedding_id } });
    const [c] = w?.primary_contact_id ? await db.select<{ full_name: string; email: string | null }>("contacts", { where: { id: w.primary_contact_id } }) : [];
    if (c?.email && deps.channels) {
      const fin = invs.find((i) => i.kind === "final") ?? invs[0]!;
      await deliver(deps, { kind: "email", to: c.email, subject: `Your Wiwaha invoices (${invs.map((i) => i.number).join(", ")})`, body: `Dear ${c.full_name.split(" ")[0]},\n\nThank you for celebrating with us. Your final invoice and GST invoice are in your portal under Payments.\n\nTotal ${rupees(fin.total_paise)}${fin.balance_paise > 0 ? ` · balance due ${rupees(fin.balance_paise)}` : " · fully paid, thank you"}.\n\nWarmly,\nTeam Wiwaha`, weddingId: invs[0]!.wedding_id, subjectTable: "invoices", subjectId: fin.id });
    }
    await ctx.log({ action: "invoices_decided", status: "ok", weddingId: invs[0]!.wedding_id, input: { status }, output: { issued: invs.length } });
    return { issued: invs.length };
  });
}

/** Handover inspection recorded: propose the security-deposit decision to Prashanth. */
export async function onInspectionDone(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ decision: string | null; approvalId: string | null }>> {
  return runAgent(deps, FINANCE, { action: "inspection_done", weddingId, input: {}, fallbackTitle: "Propose the security-deposit decision" }, async (ctx) => {
    const db = agentDb(ctx, FINANCE_TOOLS);
    const rule = ctx.book.get("closeout.inspection");
    const [ins] = await db.select<{ id: string; damage_total_paise: number; items: { area: string; ok: boolean; note?: string; damage_paise?: number }[]; approval_id: string | null }>("inspections", { where: { wedding_id: weddingId } });
    if (!ins || ins.approval_id) return { decision: null, approvalId: ins?.approval_id ?? null };
    const [w] = await db.select<{ title: string }>("weddings", { where: { id: weddingId } });
    const deposit = rule.security_deposit_paise;
    if (deposit === null) {
      await alertStaff(deps, { role: rule.deposit_decision_role, title: `Inspection done: ${w?.title ?? ""}`, body: `Damage recorded: ${rupees(ins.damage_total_paise)}. No security deposit is set in the policy book.`, link: `/team/weddings/${weddingId}`, weddingId });
      return { decision: null, approvalId: null };
    }
    const decision = ins.damage_total_paise <= 0 ? "refund_full" : ins.damage_total_paise < deposit ? "refund_partial" : "retain";
    const refund = Math.max(0, deposit - ins.damage_total_paise);
    const issues = ins.items.filter((i) => !i.ok).map((i) => `• ${i.area}: ${i.note ?? "issue"}${i.damage_paise ? ` (${rupees(i.damage_paise)})` : ""}`);
    const approvalId = await requestApproval(ctx, { kind: FINANCE_GATE.depositApproval, weddingId, title: `Security deposit: ${w?.title ?? ""}`, summary: `${decision.replace("_", " ")} · refund ${rupees(refund)} of ${rupees(deposit)}`, payload: { body: [`Proposed: ${decision.replace("_", " ")} (refund ${rupees(refund)})`, `Damage: ${rupees(ins.damage_total_paise)}`, ...issues].join("\n"), decision, refund_paise: refund, inspection_id: ins.id } });
    await db.update("inspections", { id: ins.id }, { approval_id: approvalId });
    await ctx.log({ action: "inspection_done", status: "gated", weddingId, input: { damage_paise: ins.damage_total_paise }, output: { decision, refund_paise: refund }, policyKeys: ["closeout.inspection"], policyVersions: ctx.book.versions(["closeout.inspection"]) });
    return { decision, approvalId };
  });
}

export async function onDepositDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ recorded: boolean }>> {
  return runAgent(deps, FINANCE, { action: "deposit_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Record the deposit decision" }, async (ctx) => {
    const db = agentDb(ctx, FINANCE_TOOLS);
    const [a] = await db.select<{ payload: { decision?: string; refund_paise?: number }; edited_payload: { decision?: string; refund_paise?: number } | null; decided_by: string | null }>("approvals", { where: { id: approvalId } });
    const [ins] = await db.select<{ id: string; wedding_id: string }>("inspections", { where: { approval_id: approvalId } });
    if (!a || !ins || status === "rejected") return { recorded: false };
    const final = { ...a.payload, ...(a.edited_payload ?? {}) };
    await db.update("inspections", { id: ins.id }, { deposit_decision: final.decision ?? null, deposit_refund_paise: final.refund_paise ?? null, decided_by: a.decided_by, decided_at: ctx.now.toISOString() });
    await alertStaff(deps, { role: "accounts", title: "Deposit decision recorded", body: `${String(final.decision ?? "").replace("_", " ")} · refund ${rupees(final.refund_paise ?? 0)}. Please process it.`, link: `/team/weddings/${ins.wedding_id}`, weddingId: ins.wedding_id });
    await ctx.log({ action: "deposit_decided", status: "ok", weddingId: ins.wedding_id, input: { status }, output: { decision: final.decision ?? null } });
    return { recorded: true };
  });
}

/** Daily: payments whose received amount or gateway record doesn't match → accounts, once each. */
export async function reconcilePayments(deps: AgentDeps): Promise<RunOutcome<{ flagged: number }>> {
  return runAgent(deps, FINANCE, { action: "reconcile_payments", input: {}, fallbackTitle: "Reconcile payments" }, async (ctx) => {
    const db = agentDb(ctx, FINANCE_TOOLS);
    const paid = await db.select<{ id: string; wedding_id: string; label: string; amount_paise: number; paid_amount_paise: number | null; gateway: string | null; gateway_ref: string | null; paid_at: string | null }>("payments", { where: { status: "paid" } });
    let flagged = 0;
    for (const p of paid) {
      const issue = p.paid_amount_paise !== null && p.paid_amount_paise !== p.amount_paise ? `received ${rupees(p.paid_amount_paise)} against ${rupees(p.amount_paise)}`
        : p.gateway === "razorpay" && !p.gateway_ref ? "marked paid without a Razorpay payment id" : null;
      if (!issue || !(await claimRun(db, "reconcile", p.id))) continue;
      await alertStaff(deps, { role: "accounts", title: `Check payment: ${p.label}`, body: `${issue}${p.paid_at ? ` on ${formatDateIST(p.paid_at)}` : ""}.`, link: `/team/weddings/${p.wedding_id}`, weddingId: p.wedding_id });
      flagged++;
    }
    await ctx.log({ action: "reconcile_payments", status: "ok", input: { checked: paid.length }, output: { flagged } });
    return { flagged };
  });
}
