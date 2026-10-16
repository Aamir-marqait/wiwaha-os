import type { AppRole } from "@wiwaha/db";
import { BarChart3, BedDouble, CalendarDays, CheckCircle2, ClipboardCheck, FileUp, Flower2, Gem, Handshake, Inbox, IndianRupee, LayoutTemplate, Link2, List, MapPin, Megaphone, Phone, Plus, Send, Settings, Sparkles, Sun, Trees, UserCog, Users } from "lucide-react";
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
    { href: "/team/leads", label: "Leads", icon: Inbox, exact: true, roles: ["owner", "sales", "event_manager"] },
    { href: "/team/leads/import", label: "Import leads", icon: FileUp, roles: ["owner", "sales"] },
    { href: "/team/sales", label: "Sales numbers", icon: BarChart3, roles: ["owner", "sales"] },
    { href: "/team/marketing", label: "Marketing", icon: Megaphone, roles: ["owner", "sales"] },
    { href: "/team/voice", label: "Phone", icon: Phone, roles: ["owner", "sales"] },
  ] },
  { section: "venue", title: SECTION_LABELS.venue, items: [
    { href: "/team/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/team/estate", label: "Estate upkeep", icon: Trees, roles: ["owner", "staff", "event_manager"] },
    { href: "/team/catalogue/spaces", label: "Spaces", icon: MapPin, roles: ["owner", "sales", "event_manager", "staff"] },
    { href: "/team/catalogue/rooms", label: "Rooms", icon: BedDouble, roles: ["owner", "sales", "event_manager", "staff"] },
  ] },
  { section: "weddings", title: SECTION_LABELS.weddings, items: [
    { href: "/team/weddings", label: "All weddings", icon: Gem, exact: true },
    { href: "/team/weddings/new", label: "New wedding", icon: Plus, roles: ["owner", "sales"] },
  ] },
  { section: "decor", title: SECTION_LABELS.decor, items: [
    { href: "/team/decor/areas", label: "Venue areas", icon: MapPin },
    { href: "/team/decor", label: "Décor stock", icon: Flower2, exact: true },
    { href: "/team/decor/templates", label: "Templates by area", icon: LayoutTemplate },
    { href: "/team/decor/assignments", label: "Assigned to events", icon: Sparkles },
  ] },
  { section: "vendors", title: SECTION_LABELS.vendors, items: [
    { href: "/team/vendors", label: "Work orders & bookings", icon: Handshake },
    { href: "/team/catalogue/vendors", label: "Vendor list", icon: List },
  ] },
  { section: "accounts", title: SECTION_LABELS.accounts, items: [
    { href: "/team/finance", label: "Finance", icon: IndianRupee },
    { href: "/team/owner", label: "Numbers", icon: BarChart3, roles: ["owner"] },
  ] },
  { section: "client", title: SECTION_LABELS.client, items: [
    { href: "/team/clients", label: "Client portal", icon: Users },
  ] },
  { section: null, title: "Admin", items: [
    { href: "/team/settings/links", label: "Links", icon: Link2 },
    { href: "/team/settings/claude", label: "Claude connector", icon: Sparkles },
    { href: "/team/settings/lists", label: "Lists", icon: List },
    { href: "/team/settings/team", label: "Team & access", icon: UserCog, roles: ["owner"] },
    { href: "/team/settings", label: "Settings", icon: Settings, exact: true },
  ] },
];

/** The groups and items this person sees. */
export function visibleGroups(role: AppRole, sections: readonly Section[]): NavGroup[] {
  return GROUPS
    .filter((g) => g.section === null || sections.includes(g.section))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
}

