import type { DbGrants } from "../../framework/db";

/**
 * Design reads functions, the briefs, the venue areas and their plain photos,
 * and the décor templates; writes moodboards and their slides (the DB refuses
 * moodboards before the décor unlock) and opens the décor questionnaire.
 */
export const DESIGN_TOOLS: DbGrants = {
  tables: {
    weddings: ["select"],
    wedding_briefs: ["select"],
    decor_briefs: ["select", "insert", "update"],
    event_functions: ["select"],
    moodboards: ["select", "insert", "update"],
    moodboard_slides: ["select", "insert", "update"],
    venue_areas: ["select"],
    media_assets: ["select"],
    decor_templates: ["select"],
    menus: ["select"],
    quotes: ["select"],
    agent_tasks: ["select", "insert"],
    wedding_selections: ["select"],
    wedding_stages: ["update"],
    approvals: ["select"],
    contacts: ["select"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
