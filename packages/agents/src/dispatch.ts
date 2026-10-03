import type { Json } from "@wiwaha/db";
import type { Dispatcher } from "./agents/chief_of_staff/agent";
import { draftHoldReleased, processLead } from "./agents/lead_desk/agent";
import { onExternalReview, onReplyDecided, onReviewSubmitted } from "./agents/reputation/agent";
import { onVisitBooked, recapVisit } from "./agents/visit_host/agent";
import type { RunOutcome } from "./framework/runner";
import type { AgentDeps, AgentTaskRow } from "./framework/types";

type Handler = (deps: AgentDeps, task: AgentTaskRow, p: Record<string, unknown>) => Promise<RunOutcome<unknown>> | null;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

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
    approval_decided: (d, _t, p) => (str(p.approval_id) ? onReplyDecided(d, str(p.approval_id)!, str(p.status) ?? "approved") : null),
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
