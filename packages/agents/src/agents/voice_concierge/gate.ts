/**
 * What needs a human for the Voice Concierge:
 *  - a caller who asks for a person, is upset, or asks something outside the
 *    policy book is handed to the team at once (live transfer, or an urgent
 *    callback task when nobody can take it)
 *  - discount requests go to Prashanth; the concierge never promises one
 *  - WhatsApp messages it promises (brochure, video tour) wait in the
 *    approval queue while the agent is in `draft`
 * Booking a site visit is not gated: it is a slot on the sales calendar, and
 * the Visit Host's confirmation message is gated instead.
 */
export const VOICE_GATE = {
  discountsTo: "owner",
  unknownsTo: "sales",
  messageApprovalKind: "client_message",
} as const;
