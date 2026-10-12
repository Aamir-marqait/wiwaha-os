import type { DbGrants } from "../../framework/db";

/** Vendor Coordinator reads the wedding, vendor list and approved quote; writes bookings (with work orders), chase state and checklist tasks. */
export const VENDOR_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    event_functions: ["select"],
    vendors: ["select"],
    vendor_bookings: ["select", "insert", "update"],
    quotes: ["select"],
    quote_lines: ["select"],
    quote_line_costs: ["select"],
    tasks: ["insert"],
    wedding_stages: ["select", "update"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
