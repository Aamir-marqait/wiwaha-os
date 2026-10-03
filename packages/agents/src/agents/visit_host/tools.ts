import type { DbGrants } from "../../framework/db";

/** Visit Host reads the visit, the family and the executive; writes the visit's brief, reminder and recap fields. */
export const VISIT_HOST_TOOLS: DbGrants = {
  tables: {
    visits: ["select", "update"],
    leads: ["select", "update"],
    contacts: ["select"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
