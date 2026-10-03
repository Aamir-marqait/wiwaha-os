/**
 * Stand-up only talks to staff (briefs and escalations), so nothing it sends
 * needs approval. It never changes a task's owner or due date.
 */
export const STANDUP_GATE = { needsApproval: false } as const;
