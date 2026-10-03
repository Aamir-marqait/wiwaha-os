/**
 * Quote's human gates: every quote is an approval (`quote`) before the couple
 * sees it; lines not in the price book, and custom décor, are flagged
 * off-book and the database refuses to send the quote until Prashanth has
 * approved it. The couple then approves it in the portal.
 */
export const QUOTE_GATE = { approval: "quote", approver: "owner" } as const;
