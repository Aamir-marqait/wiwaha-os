import type { DbGrants } from "../../framework/db";

/** Ads Analyst reads spend, leads and bookings; writes only its weekly report approval. */
export const ADS_TOOLS: DbGrants = {
  tables: {
    ad_spend: ["select"],
    leads: ["select"],
    weddings: ["select"],
    approvals: ["select"],
    job_runs: ["insert"],
    outbox: ["insert"],
  },
};
