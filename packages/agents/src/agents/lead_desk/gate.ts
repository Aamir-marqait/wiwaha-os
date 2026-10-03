import type { GuardrailFlag } from "../../framework/guardrails";

/**
 * What needs a human for Lead Desk:
 *  - every client-facing reply while the agent is in `draft` (the default)
 *  - any reply with a guardrail flag, whatever the dial says
 *  - hot leads are handed to the sales executive (notification)
 *  - discount requests and price questions the policy book can't answer go to
 *    Prashanth through the human queue; the reply never answers them
 */
export const LEAD_DESK_GATE = {
  approvalKind: "lead_reply",
  hotLeadNotifyRole: "sales",
  escalateTo: "owner",
} as const;

export function replyPriority(hot: boolean, flags: readonly GuardrailFlag[]): 1 | 2 | 3 {
  if (flags.length > 0) return 1;
  return hot ? 1 : 2;
}
