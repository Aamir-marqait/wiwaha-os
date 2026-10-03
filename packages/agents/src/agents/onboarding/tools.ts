import type { DbGrants } from "../../framework/db";

/** Onboarding reads the wedding and family, writes portal memberships and the WhatsApp-group task. */
export const ONBOARDING_TOOLS: DbGrants = {
  tables: {
    weddings: ["select", "update"],
    wedding_contacts: ["select"],
    wedding_members: ["select", "insert", "update"],
    contacts: ["select"],
    profiles: ["select"],
    tasks: ["select", "insert"],
    outbox: ["insert"],
    messages: ["update"],
  },
};
