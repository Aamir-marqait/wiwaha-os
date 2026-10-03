/**
 * Onboarding's gates (PRD §8: "None" beyond the defaults):
 *  - the welcome letter is a `client_message` approval while in `draft`
 *  - portal logins are Supabase invites to the family's own email; the
 *    couple controls what parents and the planner may do
 *  - the family WhatsApp group is created by the event manager (WhatsApp's
 *    Business API can't create groups), from a task with the member list
 */
export const ONBOARDING_GATE = { messageApproval: "client_message" } as const;
