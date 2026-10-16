import type { DbGrants } from "../../framework/db";

/** Content Studio reads the brand, the library and consented testimonials; writes scripts, plans and (legacy) draft posts. */
export const CONTENT_TOOLS: DbGrants = {
  tables: {
    content_posts: ["select", "insert", "update"],
    reviews: ["select"],
    approvals: ["select"],
    job_runs: ["insert"],
    outbox: ["insert"],
  },
};

export const STUDIO_TOOLS: DbGrants = {
  tables: {
    studio_brand: ["select"],
    studio_items: ["select", "insert", "update"],
    studio_plans: ["select", "insert", "update"],
    media_assets: ["select", "update"],
    media_folders: ["select"],
    venue_areas: ["select"],
    agent_tasks: ["insert"],
    job_runs: ["insert"],
    reviews: ["select"],
  },
};
