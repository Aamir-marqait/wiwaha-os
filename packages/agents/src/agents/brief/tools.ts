import type { DbGrants } from "../../framework/db";

/** Brief reads the couple's brief and functions; writes the brief's review status and the stage card. */
export const BRIEF_TOOLS: DbGrants = {
  tables: {
    agent_tasks: ["insert"],
    weddings: ["select"],
    wedding_briefs: ["select", "insert", "update"],
    event_functions: ["select"],
    wedding_stages: ["select", "update"],
    contacts: ["select"],
    approvals: ["select"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
