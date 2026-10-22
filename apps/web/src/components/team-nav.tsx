"use client";
import type { AppRole } from "@wiwaha/db";
import { cn } from "@wiwaha/ui";
import { CalendarDays, ChevronDown, Gem, Inbox, IndianRupee, LayoutDashboard, LayoutGrid, Trees } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { type NavItem, visibleGroups } from "@/lib/nav";
import type { Section } from "@/lib/sections";

function isActive(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

const STORE = "wiwaha.nav.open";

/** Desktop sidebar: the dashboard on top, then each heading as a dropdown. */
export function SideNav({ role, sections, approvals, toSend = 0 }: { role: AppRole; sections: Section[]; approvals: number; toSend?: number }) {
  const path = usePathname();
  const counts = { approvals, toSend };
  const groups = visibleGroups(role, sections);
  const activeTitle = groups.find((g) => g.title && g.items.some((i) => isActive(path, i.href, i.exact)))?.title ?? null;
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeTitle ? [activeTitle] : []));
  // Remember which headings were open; always open the one you're in.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "[]") as unknown;
      if (Array.isArray(saved)) setOpen((o) => new Set([...o, ...saved.filter((x): x is string => typeof x === "string")]));
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => { if (activeTitle) setOpen((o) => (o.has(activeTitle) ? o : new Set([...o, activeTitle]))); }, [activeTitle]);
  const toggle = (t: string) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(t)) n.delete(t); else n.add(t);
    try { localStorage.setItem(STORE, JSON.stringify([...n])); } catch { /* storage unavailable */ }
    return n;
  });
  const link = (item: NavItem, nested: boolean) => {
    const active = isActive(path, item.href, item.exact);
    const n = item.badge ? counts[item.badge] : 0;
    if (item.hideWhenZero && n === 0 && !active) return null;
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", nested ? "py-1.5 pl-9" : "py-2", active ? "bg-sage-700 text-white" : "text-sage-100 hover:bg-sage-700/50")}>
        {nested ? null : <item.icon className="size-[18px]" aria-hidden />}
        <span className="flex-1">{item.label}</span>
        {n > 0 ? <span className={cn("rounded-full px-2 py-0.5 text-xs", active ? "bg-white/20" : "bg-gold-400 text-ink")}>{n}</span> : null}
      </Link>
    );
  };
  return (
    <nav className="-mx-1 space-y-1 overflow-y-auto px-1">
      {groups.map((g) => {
        if (!g.title) return <div key="top" className="space-y-0.5 pb-2">{g.items.map((i) => link(i, false))}</div>;
        // A heading with one page is just that page.
        if (g.items.length === 1) return <div key={g.title}>{link(g.items[0]!, false)}</div>;
        const isOpen = open.has(g.title);
        const Icon = g.items[0]!.icon;
        const here = g.title === activeTitle;
        return (
          <div key={g.title}>
            <button type="button" onClick={() => toggle(g.title!)} aria-expanded={isOpen}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors", here && !isOpen ? "bg-sage-700/60 text-white" : "text-sage-100 hover:bg-sage-700/50")}>
              <Icon className="size-[18px]" aria-hidden />
              <span className="flex-1">{g.title}</span>
              <ChevronDown className={cn("size-4 transition-transform", isOpen ? "rotate-180" : "")} aria-hidden />
            </button>
            {isOpen ? <div className="mt-0.5 space-y-0.5">{g.items.map((i) => link(i, true))}</div> : null}
          </div>
        );
      })}
    </nav>
  );
}

/** Phone: the dashboard, the person's main pages, and More for everything else. */
export function BottomNav({ role, sections, approvals }: { role: AppRole; sections: Section[]; approvals: number }) {
  const path = usePathname();
  const pick: NavItem[] = [
    ...(sections.includes("sales_marketing") && role !== "staff" ? [{ href: "/team/leads", label: "Leads", icon: Inbox }] : []),
    ...(sections.includes("weddings") ? [{ href: "/team/weddings", label: "Weddings", icon: Gem }] : []),
    ...(sections.includes("venue") ? [{ href: "/team/calendar", label: "Calendar", icon: CalendarDays }] : []),
    ...(sections.includes("accounts") && !sections.includes("sales_marketing") ? [{ href: "/team/finance", label: "Finance", icon: IndianRupee }] : []),
    ...(role === "staff" ? [{ href: "/team/estate", label: "Estate", icon: Trees }] : []),
  ].slice(0, 3);
  const items: NavItem[] = [
    { href: "/team", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ...pick,
    { href: "/team/more", label: "More", icon: LayoutGrid, badge: "approvals" as const },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(path, item.href, item.exact);
          return (
            <li key={item.href}>
              <Link href={item.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium", active ? "text-sage-800" : "text-ink-soft")}>
                <item.icon className={cn("size-5", active ? "text-sage-700" : "")} aria-hidden />
                {item.label}
                {item.badge === "approvals" && approvals > 0 ? <span className="absolute right-[18%] top-1 min-w-4 rounded-full bg-burgundy-600 px-1 text-center text-[10px] leading-4 text-white">{approvals}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
