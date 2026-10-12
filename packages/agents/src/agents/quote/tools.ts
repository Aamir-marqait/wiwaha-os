import type { DbGrants } from "../../framework/db";

/** Quote reads the brief, menus, finalised décor and entertainment/extras, the price book and option lists; writes quotes and their lines. */
export const QUOTE_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    event_functions: ["select"],
    menus: ["select"],
    moodboards: ["select"],
    price_book_items: ["select"],
    wedding_selections: ["select"],
    service_options: ["select"],
    agent_tasks: ["select", "insert"],
    quotes: ["select", "insert", "update"],
    quote_lines: ["select", "insert", "update"],
    quote_line_costs: ["insert"],
    approvals: ["select"],
    contacts: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
