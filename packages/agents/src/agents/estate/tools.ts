import type { DbGrants } from "../../framework/db";

/** Estate reads schedules and stock; creates maintenance tasks and purchase requests. */
export const ESTATE_TOOLS: DbGrants = {
  tables: {
    maintenance_schedules: ["select", "update"],
    inventory_items: ["select"],
    purchase_requests: ["select", "insert", "update"],
    tasks: ["select", "insert"],
    approvals: ["select"],
    profiles: ["select"],
    outbox: ["insert"],
  },
};
