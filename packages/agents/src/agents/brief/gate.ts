/**
 * Brief's human gate: the event manager reviews every submitted brief
 * (approval kind `brief`). Follow-up questions to the couple are
 * `client_message` approvals while the agent is in `draft`.
 */
export const BRIEF_GATE = { reviewApproval: "brief", messageApproval: "client_message" } as const;
