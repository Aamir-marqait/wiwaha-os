import type { DbGrants } from "../../framework/db";

/** Rooms & Guests reads rooms and allocations; assigns rooms and creates housekeeping and pickup tasks. */
export const ROOMS_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    rooms: ["select"],
    room_allocations: ["select", "update"],
    tasks: ["select", "insert"],
    contacts: ["select"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
