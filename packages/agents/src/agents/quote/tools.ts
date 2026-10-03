import type { DbGrants } from "../../framework/db";

/** Quote reads the brief, menus, finalised décor and the price book; writes quotes and their lines. */
export const QUOTE_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    event_functions: ["select"],
    menus: ["select"],
    moodboards: ["select"],
    price_book_items: ["select"],
    quotes: ["select", "insert", "update"],
    quote_lines: ["select", "insert", "update"],
    approvals: ["select"],
    contacts: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
