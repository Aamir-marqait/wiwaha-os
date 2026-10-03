import type { DbGrants } from "../../framework/db";

/** Stand-up reads tasks and approvals; writes briefs and escalation marks. */
export const STANDUP_TOOLS: DbGrants = {
  tables: {
    tasks: ["select", "update"],
    profiles: ["select"],
    weddings: ["select"],
    approvals: ["select"],
    briefs: ["insert", "select"],
    outbox: ["insert"],
  },
};
