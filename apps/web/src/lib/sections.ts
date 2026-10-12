import type { AppRole } from "@wiwaha/db";

/**
 * The team app's headings. A person sees the sections they have access to
 * (profiles.sections, set by the owner) or, when unset, their role's defaults.
 * Sections only shape what's shown; RLS still decides what can be read or changed.
 */
export const SECTIONS = ["sales_marketing", "venue", "weddings", "vendors", "accounts", "client"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  sales_marketing: "Sales & Marketing",
  venue: "Venue",
  weddings: "Weddings",
  vendors: "Vendors",
  accounts: "Accounts",
  client: "Client",
};

export const SECTION_HINTS: Record<Section, string> = {
  sales_marketing: "Leads, visits, phone, sales numbers, marketing",
  venue: "Calendar, spaces, rooms, estate upkeep and stock",
  weddings: "Every wedding: functions, décor, food, entertainment, extras",
  vendors: "Vendor list and what each is booked for",
  accounts: "Payments, invoices, costs and profit",
  client: "Couples' and families' portal logins",
};

/** Roles whose database access fits each section (RLS); others can't be given it. */
export const SECTION_ROLES: Record<Section, readonly AppRole[]> = {
  sales_marketing: ["owner", "sales", "event_manager"],
  venue: ["owner", "sales", "event_manager", "staff", "accounts"],
  weddings: ["owner", "sales", "event_manager", "accounts"],
  vendors: ["owner", "sales", "event_manager", "accounts"],
  accounts: ["owner", "accounts"],
  client: ["owner", "sales", "event_manager"],
};

const ROLE_DEFAULTS: Record<AppRole, readonly Section[]> = {
  owner: SECTIONS,
  sales: ["sales_marketing", "venue", "weddings", "client"],
  event_manager: ["venue", "weddings", "vendors", "client"],
  staff: ["venue"],
  accounts: ["accounts", "weddings"],
  client: [],
  vendor: [],
  agent: [],
};

export function isSection(s: string): s is Section {
  return (SECTIONS as readonly string[]).includes(s);
}

/** What this person sees. The owner always sees everything. */
export function sectionsFor(role: AppRole, custom: readonly string[] | null | undefined): Section[] {
  if (role === "owner") return [...SECTIONS];
  if (custom) return custom.filter(isSection).filter((x) => SECTION_ROLES[x].includes(role));
  return [...ROLE_DEFAULTS[role]];
}

export function roleDefaults(role: AppRole): readonly Section[] {
  return ROLE_DEFAULTS[role];
}
