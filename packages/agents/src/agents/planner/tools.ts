import type { DbGrants } from "../../framework/db";

/** Planner reads templates and the wedding; writes tasks and run-of-show items. */
export const PLANNER_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    event_functions: ["select"],
    task_templates: ["select"],
    run_of_show_templates: ["select"],
    run_of_show_items: ["select", "insert"],
    tasks: ["select", "insert"],
    profiles: ["select"],
    vendor_bookings: ["select"],
    vendors: ["select"],
    approvals: ["select"],
    outbox: ["insert"],
  },
};
