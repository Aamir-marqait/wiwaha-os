/**
 * Vendor Coordinator's gates: lock-in and chase emails to vendors are
 * `vendor_message` approvals while in `draft`; vendor payments are approved
 * by Prashanth (Finance). Décor goes only to designated planners
 * (policy "decor.providers"); everything else is in-house.
 */
export const VENDOR_GATE = { messageApproval: "vendor_message", escalateTo: "event_manager" } as const;
