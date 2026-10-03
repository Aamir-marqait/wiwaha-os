import type { DbGrants } from "../../framework/db";

/** Design reads functions and the brief; writes moodboards (the DB refuses them before the décor unlock). */
export const DESIGN_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    wedding_briefs: ["select"],
    event_functions: ["select"],
    moodboards: ["select", "insert", "update"],
    menus: ["select"],
    quotes: ["select"],
    agent_tasks: ["select", "insert"],
    wedding_stages: ["update"],
    approvals: ["select"],
    contacts: ["select"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
