import type { DbGrants } from "../../framework/db";

/** Finance reads the wedding's money; writes invoices, inspections' deposit decisions and close-out tasks. */
export const FINANCE_TOOLS: DbGrants = {
  tables: {
    weddings: ["select", "update"],
    quotes: ["select"],
    quote_lines: ["select"],
    price_book_items: ["select"],
    payments: ["select"],
    cost_entries: ["select"],
    invoices: ["select", "insert", "update"],
    inspections: ["select", "update"],
    contacts: ["select"],
    approvals: ["select"],
    agent_tasks: ["insert", "select"],
    tasks: ["select"],
    job_runs: ["insert"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
  rpcs: ["next_invoice_number"],
};
