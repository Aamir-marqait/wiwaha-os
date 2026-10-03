/**
 * Reputation's human gates:
 *  - every public review reply is a `review_reply` approval before posting
 *  - a low score (policy "reviews.after_event") reaches Prashanth at once:
 *    in-app, on WhatsApp, and in the human queue at top priority, well
 *    inside the 2-hour rule
 *  - testimonials are only used with the couple's consent
 */
export const REPUTATION_GATE = { approvalKind: "review_reply", lowScoreTo: "owner" } as const;
