import type { AppRole } from "@wiwaha/db";
import { BarChart3, CalendarDays, CheckCircle2, ClipboardCheck, Gem, Handshake, Inbox, IndianRupee, Megaphone, Phone, Send, Settings, Sun, Trees, Users } from "lucide-react";
import { type Section, SECTION_LABELS } from "./sections";

export type Icon = typeof Sun;
export interface NavItem { href: string; label: string; icon: Icon; exact?: boolean; roles?: readonly AppRole[]; badge?: "approvals" | "toSend" }
export interface NavGroup { section: Section | null; title: string | null; items: NavItem[] }

/** Headings follow the business: sales and marketing, venue, weddings, vendors, accounts, client. */
const GROUPS: NavGroup[] = [
  { section: null, title: null, items: [
    { href: "/team", label: "Today", icon: Sun, exact: true },
    { href: "/team/tasks", label: "Tasks", icon: ClipboardCheck },
    { href: "/team/approvals", label: "Approvals", icon: CheckCircle2, badge: "approvals" },
    { href: "/team/outbox", label: "To send", icon: Send, badge: "toSend", roles: ["owner", "sales", "event_manager"] },
  ] },
  { section: "sales_marketing", title: SECTION_LABELS.sales_marketing, items: [
    { href: "/team/leads", label: "Leads", icon: Inbox, roles: ["owner", "sales", "event_manager"] },
    { href: "/team/sales", label: "Sales numbers", icon: BarChart3, roles: ["owner", "sales"] },
    { href: "/team/marketing", label: "Marketing", icon: Megaphone, roles: ["owner", "sales"] },
    { href: "/team/voice", label: "Phone", icon: Phone, roles: ["owner", "sales"] },
  ] },
  { section: "venue", title: SECTION_LABELS.venue, items: [
    { href: "/team/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/team/estate", label: "Estate", icon: Trees, roles: ["owner", "staff", "event_manager"] },
  ] },
  { section: "weddings", title: SECTION_LABELS.weddings, items: [
    { href: "/team/weddings", label: "Weddings", icon: Gem },
  ] },
  { section: "vendors", title: SECTION_LABELS.vendors, items: [
    { href: "/team/vendors", label: "Vendors", icon: Handshake },
  ] },
  { section: "accounts", title: SECTION_LABELS.accounts, items: [
    { href: "/team/finance", label: "Finance", icon: IndianRupee },
    { href: "/team/owner", label: "Numbers", icon: BarChart3, roles: ["owner"] },
  ] },
  { section: "client", title: SECTION_LABELS.client, items: [
    { href: "/team/clients", label: "Client portal", icon: Users },
  ] },
  { section: null, title: "Admin", items: [
    { href: "/team/settings", label: "Settings", icon: Settings },
  ] },
];

/** The groups and items this person sees. */
export function visibleGroups(role: AppRole, sections: readonly Section[]): NavGroup[] {
  return GROUPS
    .filter((g) => g.section === null || sections.includes(g.section))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
}

