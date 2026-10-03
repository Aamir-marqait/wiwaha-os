import type { DbGrants } from "../../framework/db";

/** Vendor Coordinator reads the wedding and vendor list; writes bookings and their chase state. */
export const VENDOR_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    event_functions: ["select"],
    vendors: ["select"],
    vendor_bookings: ["select", "insert", "update"],
    wedding_stages: ["select", "update"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
