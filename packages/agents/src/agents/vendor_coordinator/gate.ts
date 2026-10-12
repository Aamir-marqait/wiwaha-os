/**
 * Vendor Coordinator's gates: a work order is only drafted by the agent and
 * reaches the vendor after Prashanth or an event manager approves it
 * (`approve_work_order`), whatever the autonomy dial says. Chase emails are
 * `vendor_message` approvals while in `draft`; vendor payments are approved by
 * Prashanth (Finance). Décor goes only to designated planners (policy
 * "decor.providers"); everything else is in-house.
 */
export const VENDOR_GATE = { messageApproval: "vendor_message", escalateTo: "event_manager" } as const;
