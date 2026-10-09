"use client";
import { cn } from "@wiwaha/ui";
import { BarChart3, CalendarDays, CheckCircle2, ClipboardCheck, Gem, Inbox, IndianRupee, LayoutGrid, Megaphone, Phone, Send, Settings, Sun, Trees } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sidebar (desktop): everything. Bottom bar (phone): the core five + More.
const ITEMS = [
  { href: "/team", label: "Today", icon: Sun, exact: true },
  { href: "/team/leads", label: "Leads", icon: Inbox },
  { href: "/team/tasks", label: "Tasks", icon: ClipboardCheck },
  { href: "/team/calendar", label: "Calendar", icon: CalendarDays, desktopOnly: true },
  { href: "/team/weddings", label: "Weddings", icon: Gem },
  { href: "/team/approvals", label: "Approvals", icon: CheckCircle2, badge: true },
  { href: "/team/outbox", label: "To send", icon: Send, desktopOnly: true, outboxBadge: true },
  { href: "/team/sales", label: "Sales", icon: BarChart3, desktopOnly: true },
  { href: "/team/owner", label: "Numbers", icon: BarChart3, desktopOnly: true },
  { href: "/team/estate", label: "Estate", icon: Trees, desktopOnly: true },
  { href: "/team/finance", label: "Finance", icon: IndianRupee, desktopOnly: true },
  { href: "/team/marketing", label: "Marketing", icon: Megaphone, desktopOnly: true },
  { href: "/team/voice", label: "Phone", icon: Phone, desktopOnly: true },
  { href: "/team/settings", label: "Settings", icon: Settings, desktopOnly: true },
  { href: "/team/more", label: "More", icon: LayoutGrid, mobileOnly: true },
] as const;
const SIDE = ITEMS.filter((i) => !("mobileOnly" in i));
const BOTTOM = ITEMS.filter((i) => !("desktopOnly" in i));

function isActive(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

export function SideNav({ approvals, toSend = 0 }: { approvals: number; toSend?: number }) {
  const path = usePathname();
  return (
    <nav className="space-y-1">
      {SIDE.map((item) => {
        const active = isActive(path, item.href, "exact" in item ? item.exact : false);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-sage-700 text-white" : "text-sage-100 hover:bg-sage-700/50")}>
            <Icon className="size-[18px]" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {"badge" in item && approvals > 0 ? <span className={cn("rounded-full px-2 py-0.5 text-xs", active ? "bg-white/20" : "bg-gold-400 text-ink")}>{approvals}</span> : null}
            {"outboxBadge" in item && toSend > 0 ? <span className={cn("rounded-full px-2 py-0.5 text-xs", active ? "bg-white/20" : "bg-gold-400 text-ink")}>{toSend}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ approvals }: { approvals: number }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-6">
        {BOTTOM.map((item) => {
          const active = isActive(path, item.href, "exact" in item ? item.exact : false);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link href={item.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium", active ? "text-sage-800" : "text-ink-soft")}>
                <Icon className={cn("size-5", active ? "text-sage-700" : "")} aria-hidden />
                {item.label}
                {"badge" in item && approvals > 0 ? <span className="absolute right-[18%] top-1 min-w-4 rounded-full bg-burgundy-600 px-1 text-center text-[10px] leading-4 text-white">{approvals}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
