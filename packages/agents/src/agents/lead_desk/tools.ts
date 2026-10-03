import type { AgentStore } from "../../framework/types";

/**
 * The only tools Lead Desk may use. It can read leads and availability, write
 * its score, draft replies, raise approvals and escalate. It cannot send
 * messages, change the calendar or touch weddings.
 */
export const LEAD_DESK_TOOLS = [
  "getLead",
  "freeSpacesOn",
  "updateLeadScore",
  "countRecentRepliesForLead",
  "createMessage",
  "createApproval",
  "queueHuman",
  "notify",
] as const satisfies readonly (keyof AgentStore)[];

export type LeadDeskTool = (typeof LEAD_DESK_TOOLS)[number];
export type LeadDeskStore = Pick<AgentStore, LeadDeskTool>;
