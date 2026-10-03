import type { DbGrants } from "../../framework/db";

/** Wedding Room reads the couple's own record; writes decisions, nudges and call tasks. */
export const WEDDING_ROOM_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    messages: ["select", "update"],
    wedding_decisions: ["insert", "select"],
    wedding_stages: ["select", "update"],
    event_functions: ["select"],
    payments: ["select"],
    contacts: ["select"],
    wedding_members: ["select"],
    profiles: ["select"],
    tasks: ["insert"],
    outbox: ["insert"],
  },
};
