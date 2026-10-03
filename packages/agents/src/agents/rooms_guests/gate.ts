/**
 * Rooms & Guests: room assignments and staff tasks are internal. The note to
 * the couple about their rooms is a `client_message` approval while in draft.
 * Rooms beyond those available go to the event manager.
 */
export const ROOMS_GATE = { messageApproval: "client_message", escalateTo: "event_manager" } as const;
