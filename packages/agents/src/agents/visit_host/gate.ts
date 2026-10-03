/**
 * Visit Host's human gates:
 *  - every message to the family (confirmation with location, day-before
 *    reminder) is a `visit_message` approval while the agent is in `draft`
 *  - the executive runs the visit; the pre-visit brief goes straight to them
 *    (internal, never client-facing)
 */
export const VISIT_HOST_GATE = { approvalKind: "visit_message" } as const;
