import type { Json } from "@wiwaha/db";
import type { Dispatcher } from "./agents/chief_of_staff/agent";
import { draftHoldReleased, processLead } from "./agents/lead_desk/agent";
import { onExternalReview, onReplyDecided, onReviewSubmitted } from "./agents/reputation/agent";
import { onVisitBooked, recapVisit } from "./agents/visit_host/agent";
import { onBriefDecided, onBriefStarted, onBriefSubmitted } from "./agents/brief/agent";
import { draftContract, onContractDecided, onFinalPaymentStage, onPaymentReceived } from "./agents/contract_payments/agent";
import { generateMoodboards, onCustomDecided, onFinalised, onShortlisted } from "./agents/design/agent";
import { onMenuApproved, proposeMenus } from "./agents/menu/agent";
import { onboardWedding } from "./agents/onboarding/agent";
import { onQuoteDecided, prepareQuote } from "./agents/quote/agent";
import { lockVendors, onVendorReplied } from "./agents/vendor_coordinator/agent";
import { onFamilyMessage } from "./agents/wedding_room/agent";
import type { RunOutcome } from "./framework/runner";
import type { AgentDeps, AgentTaskRow } from "./framework/types";

type Handler = (deps: AgentDeps, task: AgentTaskRow, p: Record<string, unknown>) => Promise<RunOutcome<unknown>> | null;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const decided = (fn: (d: AgentDeps, approvalId: string, status: string) => Promise<RunOutcome<unknown>>): Handler =>
  (d, _t, p) => (str(p.approval_id) ? fn(d, str(p.approval_id)!, str(p.status) ?? "approved") : null);
const onWedding = (fn: (d: AgentDeps, weddingId: string) => Promise<RunOutcome<unknown>>): Handler => (d, t) => (t.wedding_id ? fn(d, t.wedding_id) : null);

/**
 * Entry points the Chief of Staff can hand work to: target agent → task kind
 * → handler. Agents themselves never import each other; adding an agent
 * means adding its handlers here.
 */
const HANDLERS: Record<string, Record<string, Handler>> = {
  lead_desk: {
    hold_released_notify_client: (d, t, p) => (t.lead_id ? draftHoldReleased(d, t.lead_id, p as { starts_on?: string; label?: string | null }) : null),
    new_lead: (d, t) => (t.lead_id ? processLead(d, t.lead_id) : null),
    lead_updated: (d, t) => (t.lead_id ? processLead(d, t.lead_id) : null),
  },
  visit_host: {
    visit_booked: (d, _t, p) => (str(p.visit_id) ? onVisitBooked(d, str(p.visit_id)!) : null),
    visit_voice_note: (d, _t, p) => (str(p.visit_id) && str(p.transcript) ? recapVisit(d, str(p.visit_id)!, str(p.transcript)!) : null),
  },
  reputation: {
    external_review: (d, _t, p) => (str(p.review_id) ? onExternalReview(d, str(p.review_id)!) : null),
    review_submitted: (d, _t, p) => (str(p.review_id) ? onReviewSubmitted(d, str(p.review_id)!) : null),
    approval_decided: decided(onReplyDecided),
  },
  // Phase 3: from booking to a locked plan. stage_started fires when the couple presses Start.
  contract_payments: {
    wedding_booked: onWedding(draftContract),
    payment_received: (d, _t, p) => (str(p.payment_id) ? onPaymentReceived(d, str(p.payment_id)!) : null),
    approval_decided: decided(onContractDecided),
    stage_started: onWedding(onFinalPaymentStage),
  },
  onboarding: { deposit_paid: onWedding(onboardWedding) },
  brief: {
    stage_started: onWedding(onBriefStarted),
    brief_submitted: onWedding(onBriefSubmitted),
    approval_decided: decided(onBriefDecided),
  },
  menu: {
    stage_started: onWedding(proposeMenus),
    menu_approved: (d, _t, p) => (str(p.menu_id) ? onMenuApproved(d, str(p.menu_id)!) : null),
  },
  design: {
    stage_started: onWedding(generateMoodboards),
    moodboard_shortlisted: (d, _t, p) => (str(p.moodboard_id) ? onShortlisted(d, str(p.moodboard_id)!) : null),
    moodboard_finalised: (d, _t, p) => (str(p.moodboard_id) ? onFinalised(d, str(p.moodboard_id)!) : null),
    approval_decided: decided(onCustomDecided),
  },
  quote: {
    quote_requested: onWedding(prepareQuote),
    approval_decided: decided(onQuoteDecided),
  },
  vendor_coordinator: {
    quote_approved: onWedding(lockVendors),
    stage_started: onWedding(lockVendors),
    vendor_replied: (d, _t, p) => (str(p.booking_id) ? onVendorReplied(d, str(p.booking_id)!) : null),
  },
  wedding_room: {
    family_message: (d, _t, p) => (str(p.message_id) ? onFamilyMessage(d, str(p.message_id)!) : null),
  },
};

export function registerHandlers(agent: string, handlers: Record<string, Handler>): void {
  HANDLERS[agent] = { ...(HANDLERS[agent] ?? {}), ...handlers };
}

export function createDispatcher(deps: AgentDeps): Dispatcher {
  return async (target, task) => {
    const payload = (task.payload && typeof task.payload === "object" && !Array.isArray(task.payload) ? task.payload : {}) as Record<string, unknown>;
    const handler = HANDLERS[target]?.[task.kind];
    const run = handler?.(deps, task, payload);
    if (!run) return null;
    const out = await run;
    if (out.status === "done") return { ok: true, result: (out.result ?? {}) as Json };
    return { ok: false, result: { status: out.status, ...(out.status === "error" ? { error: out.error } : {}) } as Json };
  };
}
