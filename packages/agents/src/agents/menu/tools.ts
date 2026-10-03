import type { DbGrants } from "../../framework/db";

/** Menu reads the brief, library and price book; writes menus, their items and the chef/tasting tasks. */
export const MENU_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    wedding_briefs: ["select"],
    event_functions: ["select"],
    menus: ["select", "insert", "update"],
    menu_items: ["select", "insert"],
    menu_library: ["select"],
    price_book_items: ["select"],
    moodboards: ["select"],
    quotes: ["select"],
    agent_tasks: ["select", "insert"],
    tasks: ["select", "insert"],
    wedding_stages: ["update"],
    contacts: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
