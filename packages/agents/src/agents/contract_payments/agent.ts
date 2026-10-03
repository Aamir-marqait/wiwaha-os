import type { Json } from "@wiwaha/db";
import { addDays, formatDateIST, rupees } from "@wiwaha/db";
import type { PolicyKey } from "@wiwaha/policy";
import { renderContract } from "../../domain/contract";
import { where, type Db } from "../../framework/db";
import { agentDb, alertStaff, deliver, istDate, proposeClientMessage, requestApproval } from "../../framework/kit";
import { runAgent, type RunContext, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { CONTRACT_GATE } from "./gate";
import { CONTRACT_PAYMENTS_TOOLS } from "./tools";

export const CONTRACT_PAYMENTS = "contract_payments";
const POLICIES: readonly PolicyKey[] = ["payments.schedule", "contract.template", "contracts.process", "decor.providers", "planning.start", "audit.portal_edits", "discounts"];

interface WeddingRow { id: string; code: string; title: string; primary_contact_id: string | null; event_start: string; event_end: string; guest_count: number | null; complimentary_rooms: number; contract_value_paise: number | null; stage: string }
interface PaymentRow { id: string; wedding_id: string; milestone: string; label: string; amount_paise: number; due_on: string; status: string; link_url: string | null; link_id: string | null; receipt_number: string | null; paid_amount_paise: number | null; reminders_sent: { offset_days: number; at: string }[] | null; sort: number }

async function loadWedding(db: Db, weddingId: string) {
  const [w] = await db.select<WeddingRow>("weddings", { where: { id: weddingId } });
  if (!w) throw new Error(`Wedding ${weddingId} not found`);
  const [contact] = w.primary_contact_id ? await db.select<{ id: string; full_name: string; phone_e164: string | null; email: string | null }>("contacts", { where: { id: w.primary_contact_id } }) : [];
  const payments = await db.select<PaymentRow>("payments", { where: { wedding_id: weddingId }, order: [{ column: "sort" }] });
  return { w, contact: contact ?? null, payments };
}

const firstName = (n: string | null | undefined) => n?.split(" ")[0] ?? "there";

/** After "Mark as booked": draft the contract and put it in front of Prashanth. */
export async function draftContract(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ contractId: string; approvalId: string }>> {
  return runAgent(deps, CONTRACT_PAYMENTS, { action: "draft_contract", weddingId, input: { wedding_id: weddingId }, fallbackTitle: "Prepare the contract for a new booking" }, async (ctx) => {
    const db = agentDb(ctx, CONTRACT_PAYMENTS_TOOLS);
    const { w, contact, payments } = await loadWedding(db, weddingId);
    const existing = await db.select<{ id: string; version: number; status: string }>("contracts", { where: { wedding_id: weddingId }, order: [{ column: "version", ascending: false }] });
    const open = existing.find((c) => ["draft", "pending_approval", "sent", "signed"].includes(c.status));
    if (open && open.status !== "draft") throw new Error(`A contract (v${open.version}) is already ${open.status}`);
    const entries = await db.select<{ space_id: string | null }>("calendar_entries", { where: { wedding_id: weddingId, status: "confirmed", space_id: where.notNull() } });
    const spaces = entries.length ? await db.select<{ id: string; name: string }>("spaces", { where: { id: where.in([...new Set(entries.map((e) => e.space_id!))]) } }) : [];
    const version = (existing[0]?.version ?? 0) + 1;
    const body = renderContract(ctx.book, {
      weddingCode: w.code, couple: w.title, primaryContact: { name: contact?.full_name ?? w.title, phone: contact?.phone_e164 ?? null, email: contact?.email ?? null },
      eventStart: w.event_start, eventEnd: w.event_end, guestCount: w.guest_count, spaces: spaces.map((s) => s.name), complimentaryRooms: w.complimentary_rooms,
      totalPaise: w.contract_value_paise ?? payments.reduce((a, p) => a + p.amount_paise, 0),
      payments: payments.map((p) => ({ label: p.label, amountPaise: p.amount_paise, dueOn: p.due_on })), version, preparedOn: istDate(ctx.now),
    });
    const [contract] = open?.status === "draft"
      ? await db.update<{ id: string }>("contracts", { id: open.id }, { body_md: body, status: "pending_approval" })
      : await db.insert<{ id: string }>("contracts", { wedding_id: weddingId, version, body_md: body, status: "pending_approval", template_key: ctx.book.get("contracts.process").template_version });
    const deposit = payments.find((p) => p.milestone === "deposit");
    const note = `Namaste ${firstName(contact?.full_name)}, congratulations, and thank you for choosing Wiwaha by Praman! Your contract is ready to sign online (link below), along with the link for the ${deposit ? `${deposit.label.toLowerCase()} of ${rupees(deposit.amount_paise)}` : "first payment"}. Your event manager will be in touch soon.\n\nWarmly,\nTeam Wiwaha`;
    const approvalId = await requestApproval(ctx, {
      kind: CONTRACT_GATE.contractApproval, weddingId, priority: 1,
      title: `Contract for ${w.title} (v${version})`,
      summary: `${formatDateIST(w.event_start)} · ${rupees(w.contract_value_paise ?? 0)} · sent for e-signature with the deposit link once you approve`,
      payload: { contract_id: contract!.id, body: note, contract_md: body, channel: contact?.phone_e164 ? "whatsapp" : "email", to: contact?.phone_e164 ?? contact?.email ?? null },
    });
    await db.update("contracts", { id: contract!.id }, { approval_id: approvalId });
    await ctx.log({ action: "draft_contract", status: "gated", weddingId, subjectTable: "contracts", subjectId: contract!.id, input: { wedding_id: weddingId }, output: { version, approval_id: approvalId }, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { contractId: contract!.id, approvalId };
  });
}

/** Prashanth decided the contract: send it for e-signature with the deposit link (or park it). */
export async function onContractDecided(deps: AgentDeps, approvalId: string, status: string): Promise<RunOutcome<{ sent: boolean }>> {
  return runAgent(deps, CONTRACT_PAYMENTS, { action: "contract_decided", input: { approval_id: approvalId, status }, fallbackTitle: "Send an approved contract" }, async (ctx) => {
    const db = agentDb(ctx, CONTRACT_PAYMENTS_TOOLS);
    const [a] = await db.select<{ id: string; kind: string; payload: Record<string, string | null>; edited_payload: Record<string, string | null> | null; wedding_id: string | null }>("approvals", { where: { id: approvalId } });
    if (!a || a.kind !== "contract") return { sent: false };
    const [contract] = await db.select<{ id: string; wedding_id: string; version: number; body_md: string; status: string }>("contracts", { where: { id: a.payload.contract_id ?? "" } });
    if (!contract) throw new Error("Contract not found");
    if (status === "rejected") {
      await db.update("contracts", { id: contract.id }, { status: "draft" });
      await deps.store.queueHuman({ agentKey: CONTRACT_PAYMENTS, reason: "escalation", weddingId: contract.wedding_id, assignedRole: "owner", title: "Contract sent back for changes", detail: "Edit the wedding details or ask the agent to redraft." });
      await ctx.log({ action: "contract_decided", status: "ok", weddingId: contract.wedding_id, input: { status }, output: { sent: false } });
      return { sent: false };
    }
    const { w, contact, payments } = await loadWedding(db, contract.wedding_id);
    const channels = ctx.deps.channels;
    if (!channels) throw new Error("No channels configured");
    const sig = await channels.esign.requestSignature({ documentTitle: `Venue Agreement ${w.code} v${contract.version}`, documentHtml: contract.body_md, referenceId: contract.id, signers: [{ name: contact?.full_name ?? w.title, email: contact?.email ?? null, phone: contact?.phone_e164 ?? null }] });
    await db.update("contracts", { id: contract.id }, { status: "sent", sent_at: ctx.now.toISOString(), esign_provider: sig.provider, esign_ref: sig.requestId, esign_url: sig.signUrl });
    await db.insert("outbox", { kind: "esign", provider: sig.provider, to_address: contact?.email ?? contact?.phone_e164 ?? null, status: sig.status, provider_ref: sig.requestId, wedding_id: w.id, subject_table: "contracts", subject_id: contract.id, sent_at: ctx.now.toISOString() });
    const deposit = payments.find((p) => p.milestone === "deposit");
    const link = deposit ? await ensureLink(ctx, db, deposit, w, contact) : null;
    // The message was part of what Prashanth approved, so it goes now.
    const final = { ...a.payload, ...(a.edited_payload ?? {}) };
    const to = final.to ?? contact?.phone_e164 ?? contact?.email ?? null;
    if (to) {
      const body = `${final.body ?? ""}\n\nSign your contract: ${sig.signUrl ?? "(link to follow)"}${link ? `\nPay the deposit: ${link}` : ""}`;
      const messageId = await deps.store.createMessage({ weddingId: w.id, channel: final.channel === "email" ? "email" : "whatsapp", direction: "outbound", status: "approved", authorKind: "agent", agentKey: CONTRACT_PAYMENTS, approvalId, toAddress: to, subject: `Your Wiwaha contract (${w.code})`, body });
      await deliver(deps, { kind: final.channel === "email" ? "email" : "whatsapp", to, subject: `Your Wiwaha contract (${w.code})`, body, messageId, weddingId: w.id, subjectTable: "contracts", subjectId: contract.id });
    }
    await ctx.log({ action: "contract_decided", status: "ok", weddingId: w.id, subjectTable: "contracts", subjectId: contract.id, input: { status }, output: { sign_url: sig.signUrl, deposit_link: link, esign: sig.status } });
    return { sent: true };
  });
}

async function ensureLink(ctx: RunContext, db: Db, p: PaymentRow, w: WeddingRow, contact: { full_name: string; phone_e164: string | null; email: string | null } | null): Promise<string | null> {
  if (p.link_url && p.status !== "paid") return p.link_url;
  if (p.status === "paid") return null;
  const channels = ctx.deps.channels!;
  const res = await channels.payments.createLink({
    amountPaise: p.amount_paise, description: `${w.title} · ${p.label}`, referenceId: p.id,
    customer: { name: contact?.full_name ?? w.title, email: contact?.email, phone: contact?.phone_e164 },
    callbackUrl: `${channels.appUrl}/portal/payments`,
  });
  await db.insert("outbox", { kind: "payment_link", provider: res.provider, to_address: contact?.phone_e164 ?? contact?.email ?? null, status: res.status, provider_ref: res.linkId, error: res.error ?? null, wedding_id: w.id, subject_table: "payments", subject_id: p.id, sent_at: ctx.now.toISOString() });
  if (!res.url) return null;
  await db.update("payments", { id: p.id }, { link_url: res.url, link_id: res.linkId, gateway: res.provider, status: "link_sent" });
  return res.url;
}

/** A payment landed: receipt, the next milestone's link, and onboarding on the deposit. */
export async function onPaymentReceived(deps: AgentDeps, paymentId: string): Promise<RunOutcome<{ receipt: string | null }>> {
  return runAgent(deps, CONTRACT_PAYMENTS, { action: "payment_received", input: { payment_id: paymentId }, fallbackTitle: "Send a payment receipt" }, async (ctx) => {
    const db = agentDb(ctx, CONTRACT_PAYMENTS_TOOLS);
    const [p] = await db.select<PaymentRow>("payments", { where: { id: paymentId } });
    if (!p || p.status !== "paid") return { receipt: null };
    const { w, contact, payments } = await loadWedding(db, p.wedding_id);
    const effect = ctx.book.get("payments.schedule").milestones.find((m) => m.milestone === p.milestone)?.effect ?? null;
    const next = payments.filter((x) => x.sort > p.sort && x.status !== "paid")[0] ?? null;
    const nextLink = next && next.milestone === "contract" ? await ensureLink(ctx, db, next, w, contact) : null;
    const line = effect === "holds_date" ? "Your date is now held for you." : effect === "signs_contract" ? "Your contract is now signed." : "";
    const body = `Namaste ${firstName(contact?.full_name)}, thank you! We've received ${rupees(p.paid_amount_paise ?? p.amount_paise)} for "${p.label}" (receipt ${p.receipt_number ?? "to follow"}). ${line}${next ? ` The next payment, ${next.label.toLowerCase()} of ${rupees(next.amount_paise)}, is due on ${formatDateIST(next.due_on)}${nextLink ? `: ${nextLink}` : "."}` : " That completes your payments."}\n\nWarmly,\nTeam Wiwaha`;
    await proposeClientMessage(ctx, { channel: contact?.phone_e164 ? "whatsapp" : "email", to: contact?.phone_e164 ?? contact?.email ?? null, subject: `Receipt ${p.receipt_number ?? ""}`, body, weddingId: w.id, approvalKind: CONTRACT_GATE.messageApproval, title: `Receipt for ${w.title}: ${p.label}`, summary: rupees(p.paid_amount_paise ?? p.amount_paise) });
    if (effect === "holds_date") {
      await db.insert("agent_tasks", { kind: "deposit_paid", from_agent: CONTRACT_PAYMENTS, wedding_id: w.id, payload: { payment_id: p.id } });
      if (w.stage === "booking") await db.update("weddings", { id: w.id }, { stage: "onboarding" });
    }
    await alertStaff(deps, { role: "accounts", title: `Payment received: ${w.title}`, body: `${p.label} · ${rupees(p.paid_amount_paise ?? p.amount_paise)} · ${p.receipt_number ?? ""}`, link: `/team/weddings/${w.id}`, weddingId: w.id });
    await ctx.log({ action: "payment_received", status: "ok", weddingId: w.id, subjectTable: "payments", subjectId: p.id, input: { payment_id: p.id }, output: { receipt: p.receipt_number, effect, next: next?.milestone ?? null } as Json });
    return { receipt: p.receipt_number };
  });
}

/** Reminders at T-7, T-3 and the due day (policy), once each; overdue flagged to accounts. */
export async function sendPaymentReminders(deps: AgentDeps): Promise<RunOutcome<{ reminders: number; overdue: number }>> {
  return runAgent(deps, CONTRACT_PAYMENTS, { action: "payment_reminders", input: {}, fallbackTitle: "Send payment reminders" }, async (ctx) => {
    const db = agentDb(ctx, CONTRACT_PAYMENTS_TOOLS);
    const offsets = ctx.book.get("payments.schedule").reminder_offsets_days;
    const today = istDate(ctx.now);
    const horizon = addDays(today, Math.max(...offsets, 0));
    const open = await db.select<PaymentRow>("payments", { where: { status: where.in(["scheduled", "link_sent", "overdue"]), due_on: where.lte(horizon) } });
    let reminders = 0, overdue = 0;
    for (const p of open) {
      if (p.due_on < today) {
        if (p.status !== "overdue") {
          await db.update("payments", { id: p.id }, { status: "overdue" });
          await alertStaff(deps, { role: "accounts", title: "Payment overdue", body: `${p.label} · ${rupees(p.amount_paise)} · was due ${formatDateIST(p.due_on)}`, link: `/team/weddings/${p.wedding_id}`, weddingId: p.wedding_id });
          overdue++;
        }
        continue;
      }
      const daysLeft = Math.round((Date.parse(`${p.due_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      const offset = offsets.filter((o) => o >= daysLeft).sort((a, b) => a - b)[0];
      if (offset === undefined || (p.reminders_sent ?? []).some((r) => r.offset_days === offset)) continue;
      const { w, contact } = await loadWedding(db, p.wedding_id);
      const link = await ensureLink(ctx, db, p, w, contact);
      const when = daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `on ${formatDateIST(p.due_on)}`;
      const body = `Namaste ${firstName(contact?.full_name)}, a gentle reminder that ${p.label.toLowerCase()} of ${rupees(p.amount_paise)} is due ${when}.${link ? ` You can pay securely here: ${link}` : ""} If you've already paid, thank you, and please ignore this.\n\nWarmly,\nTeam Wiwaha`;
      await proposeClientMessage(ctx, { channel: contact?.phone_e164 ? "whatsapp" : "email", to: contact?.phone_e164 ?? contact?.email ?? null, subject: `Payment reminder: ${p.label}`, body, weddingId: w.id, approvalKind: CONTRACT_GATE.messageApproval, title: `Payment reminder (T-${daysLeft}) for ${w.title}`, summary: `${p.label} · ${rupees(p.amount_paise)}` });
      await db.update("payments", { id: p.id }, { reminders_sent: [...(p.reminders_sent ?? []), { offset_days: offset, at: ctx.now.toISOString() }] });
      reminders++;
    }
    await ctx.log({ action: "payment_reminders", status: "ok", input: { today }, output: { reminders, overdue }, policyKeys: ["payments.schedule"], policyVersions: ctx.book.versions(["payments.schedule"]) });
    return { reminders, overdue };
  });
}

/** Final-payment stage started by the couple: make sure the 50% link exists and tell them. */
export async function onFinalPaymentStage(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ link: string | null }>> {
  return runAgent(deps, CONTRACT_PAYMENTS, { action: "final_payment_stage", weddingId, input: { wedding_id: weddingId }, fallbackTitle: "Send the final payment link" }, async (ctx) => {
    const db = agentDb(ctx, CONTRACT_PAYMENTS_TOOLS);
    const { w, contact, payments } = await loadWedding(db, weddingId);
    const final = payments.find((p) => p.milestone === "final" && p.status !== "paid");
    if (!final) return { link: null };
    const link = await ensureLink(ctx, db, final, w, contact);
    await proposeClientMessage(ctx, { channel: contact?.phone_e164 ? "whatsapp" : "email", to: contact?.phone_e164 ?? contact?.email ?? null, subject: "Your final payment", body: `Namaste ${firstName(contact?.full_name)}, here is the link for ${final.label.toLowerCase()} of ${rupees(final.amount_paise)}, due on ${formatDateIST(final.due_on)}: ${link ?? "(link to follow)"}\n\nWarmly,\nTeam Wiwaha`, weddingId, approvalKind: CONTRACT_GATE.messageApproval, title: `Final payment link for ${w.title}` });
    await ctx.log({ action: "final_payment_stage", status: "ok", weddingId, input: {}, output: { link } });
    return { link };
  });
}
