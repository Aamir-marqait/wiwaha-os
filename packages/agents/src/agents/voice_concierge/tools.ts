import type { DbGrants } from "../../framework/db";

/**
 * The only tools the Voice Concierge may use: read venue facts and the
 * calendar, run its own call record, create or update the caller's lead,
 * book a visit, and raise tasks for the team. It cannot touch weddings,
 * payments, prices or policies.
 */
export const VOICE_TOOLS: DbGrants = {
  tables: {
    calls: ["select", "insert", "update"],
    leads: ["select", "update"],
    contacts: ["select"],
    spaces: ["select"],
    calendar_entries: ["select"],
    profiles: ["select"],
    exec_availability: ["select"],
    exec_time_off: ["select"],
    visits: ["select", "insert", "update"],
    agent_tasks: ["insert"],
    tasks: ["insert"],
    outbox: ["insert"],
  },
  rpcs: ["ingest_lead"],
};
