import type { DbGrants } from "../../framework/db";

/** Offboarding reads the wedding and family; schedules and drafts the farewell sequence. */
export const OFFBOARDING_TOOLS: DbGrants = {
  tables: {
    weddings: ["select", "update"],
    contacts: ["select", "update"],
    offboarding_steps: ["select", "insert", "update"],
    reviews: ["select", "insert", "update"],
    tasks: ["select", "insert"],
    job_runs: ["insert"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
