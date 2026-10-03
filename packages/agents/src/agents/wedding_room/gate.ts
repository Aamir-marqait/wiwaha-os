/**
 * Wedding Room's gates: every reply to the family is a `client_message`
 * approval while in `draft`; anything off-policy, any discount or price
 * question, and anything it can't answer from the couple's own record goes
 * to the event manager (human queue). It never starts a locked stage.
 */
export const WEDDING_ROOM_GATE = { messageApproval: "client_message", escalateTo: "event_manager" } as const;
