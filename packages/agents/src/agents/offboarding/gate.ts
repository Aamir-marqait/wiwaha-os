/**
 * Offboarding: every message to the couple is a `client_message` approval
 * while in draft. The parting gift is a task for the event manager (agents
 * never buy anything). Newsletter sign-up needs the contact's email consent.
 */
export const OFFBOARDING_GATE = { messageApproval: "client_message" } as const;
