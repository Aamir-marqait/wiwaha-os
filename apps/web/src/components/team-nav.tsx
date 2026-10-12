"use client";
import type { AppRole } from "@wiwaha/db";
import { cn } from "@wiwaha/ui";
import { CheckCircle2, ClipboardCheck, Gem, Inbox, IndianRupee, LayoutGrid, Sun, Trees } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type NavItem, visibleGroups } from "@/lib/nav";
import type { Section } from "@/lib/sections";

function isActive(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

export function SideNav({ role, sections, approvals, toSend = 0 }: { role: AppRole; sections: Section[]; approvals: number; toSend?: number }) {
  const path = usePathname();
  const counts = { approvals, toSend };
  return (
    <nav className="space-y-4 overflow-y-auto">
      {visibleGroups(role, sections).map((g) => (
        <div key={g.title ?? "top"} className="space-y-0.5">
          {g.title ? <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sage-300">{g.title}</p> : null}
          {g.items.map((item) => {
            const active = isActive(path, item.href, item.exact);
            const n = item.badge ? counts[item.badge] : 0;
            return (
              <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors", active ? "bg-sage-700 text-white" : "text-sage-100 hover:bg-sage-700/50")}>
                <item.icon className="size-[18px]" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {n > 0 ? <span className={cn("rounded-full px-2 py-0.5 text-xs", active ? "bg-white/20" : "bg-gold-400 text-ink")}>{n}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Phone: Today, Tasks, the person's main heading, Approvals and More. */
export function BottomNav({ role, sections, approvals }: { role: AppRole; sections: Section[]; approvals: number }) {
  const path = usePathname();
  const main: NavItem | null =
    sections.includes("weddings") && role !== "sales" ? { href: "/team/weddings", label: "Weddings", icon: Gem }
    : sections.includes("sales_marketing") ? { href: "/team/leads", label: "Leads", icon: Inbox }
    : sections.includes("accounts") ? { href: "/team/finance", label: "Finance", icon: IndianRupee }
    : sections.includes("venue") ? { href: "/team/estate", label: "Estate", icon: Trees }
    : null;
  const second: NavItem | null = role === "sales" && sections.includes("weddings") ? { href: "/team/weddings", label: "Weddings", icon: Gem } : null;
  const items: NavItem[] = [
    { href: "/team", label: "Today", icon: Sun, exact: true },
    ...(main ? [main] : []),
    ...(second ? [second] : []),
    { href: "/team/tasks", label: "Tasks", icon: ClipboardCheck },
    { href: "/team/approvals", label: "Approvals", icon: CheckCircle2, badge: "approvals" as const },
    { href: "/team/more", label: "More", icon: LayoutGrid },
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
