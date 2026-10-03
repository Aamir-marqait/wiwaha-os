import { Card, PageTitle } from "@wiwaha/ui";
import { BarChart3, CalendarDays, IndianRupee, Megaphone, Phone, Settings, Trees } from "lucide-react";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "More" };

/** Phone navigation: everything that doesn't fit in the bottom bar. */
export default async function MorePage() {
  const viewer = await requireStaff();
  const role = viewer.profile.role;
  const items = [
    { href: "/team/calendar", icon: CalendarDays, title: "Calendar", body: "Every space, hold and booking." },
    ...(role === "owner" ? [{ href: "/team/owner", icon: BarChart3, title: "Numbers", body: "The five morning numbers, bookings and profit." }] : []),
    ...(["owner", "staff", "event_manager"].includes(role) ? [{ href: "/team/estate", icon: Trees, title: "Estate", body: "Maintenance, stock, purchases and readings." }] : []),
    ...(role === "owner" || role === "accounts" ? [{ href: "/team/finance", icon: IndianRupee, title: "Finance", body: "Invoices, costs, profit and Tally export." }] : []),
    ...(role === "owner" || role === "sales" ? [{ href: "/team/marketing", icon: Megaphone, title: "Marketing", body: "Post calendar and ad spend." }] : []),
    ...(role === "owner" || role === "sales" ? [
      { href: "/team/sales", icon: BarChart3, title: "Sales", body: "Funnel by source, calls answered, visits, reviews." },
      { href: "/team/voice", icon: Phone, title: "Phone concierge", body: "Rehearse calls with the Voice Concierge." },
    ] : []),
    { href: "/team/settings", icon: Settings, title: "Settings", body: "Policy book, agents, team, visit hours, activity log." },
  ];
  return (
    <>
      <PageTitle title="More" />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href}>
            <Card className="flex items-start gap-3 p-4 transition-shadow hover:shadow-md">
              <i.icon className="mt-0.5 size-5 text-sage-700" aria-hidden />
              <div><p className="font-medium">{i.title}</p><p className="text-sm text-ink-soft">{i.body}</p></div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
