/**
 * Finance: invoices are `invoice` approvals (accounts or Prashanth) before
 * they reach the couple; the security-deposit decision is a
 * `deposit_decision` approval for Prashanth. Nothing is refunded by an agent.
 */
export const FINANCE_GATE = { invoiceApproval: "invoice", depositApproval: "deposit_decision" } as const;
