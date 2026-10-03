import type { DbGrants } from "../../framework/db";

/** Contracts, the payment schedule and the wedding/contacts they're built from. No prices beyond the schedule. */
export const CONTRACT_PAYMENTS_TOOLS: DbGrants = {
  tables: {
    weddings: ["select", "update"],
    contacts: ["select"],
    wedding_members: ["select"],
    calendar_entries: ["select"],
    spaces: ["select"],
    contracts: ["select", "insert", "update"],
    payments: ["select", "update"],
    approvals: ["select"],
    agent_tasks: ["insert"],
    outbox: ["insert"],
    messages: ["update"],
    profiles: ["select"],
  },
};
