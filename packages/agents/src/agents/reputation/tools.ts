import type { DbGrants } from "../../framework/db";

/** Reputation reads reviews and the couple's contact; writes reply drafts and testimonial flags. */
export const REPUTATION_TOOLS: DbGrants = {
  tables: {
    external_reviews: ["select", "update"],
    reviews: ["select", "update"],
    weddings: ["select"],
    contacts: ["select"],
    profiles: ["select"],
    outbox: ["insert"],
    messages: ["update"],
    approvals: ["select"],
  },
};
