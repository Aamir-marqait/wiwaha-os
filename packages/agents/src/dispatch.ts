import type { Json } from "@wiwaha/db";
import type { Dispatcher } from "./agents/chief_of_staff/agent";
import { draftHoldReleased, processLead } from "./agents/lead_desk/agent";
import type { AgentDeps } from "./framework/types";

/**
 * Entry points the Chief of Staff can hand work to. Adding an agent in a later
 * phase means adding its handlers here; agents themselves never import each other.
 */
export function createDispatcher(deps: AgentDeps): Dispatcher {
  return async (target, task) => {
    if (target === "lead_desk" && task.lead_id) {
      if (task.kind === "hold_released_notify_client") {
        const out = await draftHoldReleased(deps, task.lead_id, (task.payload ?? {}) as { starts_on?: string; label?: string | null });
        return out.status === "done" ? { ok: true, result: { approval_id: out.result.approvalId } } : { ok: false, result: { status: out.status } as Json };
      }
      if (task.kind === "new_lead" || task.kind === "lead_updated") {
        const out = await processLead(deps, task.lead_id);
        return out.status === "done" ? { ok: true, result: { approval_id: out.result.approvalId } } : { ok: false, result: { status: out.status } as Json };
      }
    }
    return null;
  };
}
