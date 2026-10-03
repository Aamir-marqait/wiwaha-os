/**
 * Contract & Payments' human gates:
 *  - Prashanth approves every contract before it is sent (policy
 *    "contracts.process"; the database refuses to mark an unapproved
 *    contract as sent). The approval shows the message that goes with it.
 *  - receipts and payment reminders are `client_message` approvals while
 *    the agent is in `draft`
 *  - payment links are created in test mode until go-live
 */
export const CONTRACT_GATE = { contractApproval: "contract", messageApproval: "client_message", contractApprover: "owner" } as const;
