import type { AppRole } from "@wiwaha/db";
import { BarChart3, BedDouble, CalendarDays, Clapperboard, ClipboardCheck, Flower2, Gem, Handshake, Inbox, IndianRupee, LayoutDashboard, LayoutTemplate, MapPin, Palette, Send, Settings, Sparkles, Sun, Trees, UserCog, Users } from "lucide-react";
import { type Section, SECTION_LABELS } from "./sections";

export type Icon = typeof Sun;
export interface NavItem { href: string; label: string; icon: Icon; exact?: boolean; roles?: readonly AppRole[]; badge?: "approvals" | "toSend"; hideWhenZero?: boolean }
export interface NavGroup { section: Section | null; title: string | null; items: NavItem[] }

/**
 * One menu, in the order the business runs (D44): the dashboard, then sales,
 * the venue, weddings, décor, vendors, money and the couples' portal. Actions
 * like "Import leads" or "New wedding" are buttons on their pages, not menu items.
 */
const GROUPS: NavGroup[] = [
  { section: null, title: null, items: [
    { href: "/team", label: "Dashboard", icon: LayoutDashboard, exact: true },
  ] },
  { section: "sales_marketing", title: SECTION_LABELS.sales_marketing, items: [
    { href: "/team/leads", label: "Leads", icon: Inbox, roles: ["owner", "sales", "event_manager"] },
    { href: "/team/sales", label: "Sales numbers", icon: BarChart3, roles: ["owner", "sales"] },
    { href: "/team/studio", label: "Content studio", icon: Clapperboard, roles: ["owner", "sales"] },
  ] },
  { section: "venue", title: SECTION_LABELS.venue, items: [
    { href: "/team/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/team/spaces", label: "Spaces", icon: MapPin },
    { href: "/team/catalogue/rooms", label: "Rooms", icon: BedDouble, roles: ["owner", "sales", "event_manager", "staff"] },
    { href: "/team/estate", label: "Estate upkeep", icon: Trees, roles: ["owner", "staff", "event_manager"] },
  ] },
  { section: "weddings", title: SECTION_LABELS.weddings, items: [
    { href: "/team/weddings", label: "Weddings", icon: Gem },
  ] },
  { section: "decor", title: SECTION_LABELS.decor, items: [
    { href: "/team/decor", label: "Décor stock", icon: Flower2, exact: true },
    { href: "/team/decor/templates", label: "Templates by area", icon: LayoutTemplate },
    { href: "/team/decor/assignments", label: "Assigned to events", icon: Sparkles },
    { href: "/team/decor/moodboards", label: "Moodboards created", icon: Palette },
  ] },
  { section: "vendors", title: SECTION_LABELS.vendors, items: [
    { href: "/team/vendors", label: "Vendors", icon: Handshake },
  ] },
  { section: "accounts", title: SECTION_LABELS.accounts, items: [
    { href: "/team/finance", label: "Finance", icon: IndianRupee },
    { href: "/team/owner", label: "Owner numbers", icon: BarChart3, roles: ["owner"] },
  ] },
  { section: "client", title: SECTION_LABELS.client, items: [
    { href: "/team/clients", label: "Client portal", icon: Users },
  ] },
  { section: null, title: "Admin", items: [
    { href: "/team/tasks", label: "Tasks", icon: ClipboardCheck },
    { href: "/team/outbox", label: "Emails to send", icon: Send, badge: "toSend", hideWhenZero: true, roles: ["owner", "sales", "event_manager"] },
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

