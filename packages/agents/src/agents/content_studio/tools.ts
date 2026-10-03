import type { DbGrants } from "../../framework/db";

/** Content Studio reads consented testimonials; writes draft posts. */
export const CONTENT_TOOLS: DbGrants = {
  tables: {
    content_posts: ["select", "insert", "update"],
    reviews: ["select"],
    approvals: ["select"],
    job_runs: ["insert"],
    outbox: ["insert"],
  },
};
