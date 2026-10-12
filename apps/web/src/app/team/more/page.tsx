import { Card, PageTitle } from "@wiwaha/ui";
import { List } from "lucide-react";
import Link from "next/link";
import { requireStaff, viewerSections } from "@/lib/auth";
import { visibleGroups } from "@/lib/nav";

export const metadata = { title: "More" };

const BLURBS: Record<string, string> = {
  "/team/outbox": "Approved WhatsApp and email waiting for you to send.",
  "/team/leads": "Every enquiry and where it stands.",
  "/team/sales": "Funnel by source, calls answered, visits, reviews.",
  "/team/marketing": "Post calendar and ad spend.",
  "/team/voice": "Rehearse calls with the Voice Concierge.",
  "/team/calendar": "Every space, hold and booking.",
  "/team/estate": "Maintenance, stock, purchases and readings.",
  "/team/weddings": "Every wedding, by stage.",
  "/team/vendors": "Vendors and what each is booked for.",
  "/team/finance": "Invoices, costs, profit and Tally export.",
  "/team/owner": "The five morning numbers, bookings and profit.",
  "/team/clients": "Couples' and families' portal logins.",
  "/team/settings": "Policy book, agents, team and access, connections.",
};
const IN_BOTTOM_BAR = new Set(["/team", "/team/tasks", "/team/approvals"]);

/** Phone navigation: everything under its heading. */
export default async function MorePage() {
  const viewer = await requireStaff();
  const groups = visibleGroups(viewer.profile.role, viewerSections(viewer))
    .map((g) => ({ ...g, items: g.items.filter((i) => !IN_BOTTOM_BAR.has(i.href)) }))
    .filter((g) => g.items.length > 0);
  return (
    <>
      <PageTitle title="More" />
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.title ?? "top"}>
            {g.title ? <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">{g.title}</h2> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {g.items.map((i) => (
                <Link key={i.href} href={i.href}>
                  <Card className="flex items-start gap-3 p-4 transition-shadow hover:shadow-md">
                    <i.icon className="mt-0.5 size-5 text-sage-700" aria-hidden />
                    <div><p className="font-medium">{i.label}</p><p className="text-sm text-ink-soft">{BLURBS[i.href] ?? ""}</p></div>
                  </Card>
                </Link>
              ))}
              {g.title === "Admin" ? (
                <Link href="/team/settings/lists">
                  <Card className="flex items-start gap-3 p-4 transition-shadow hover:shadow-md">
                    <List className="mt-0.5 size-5 text-sage-700" aria-hidden />
                    <div><p className="font-medium">Lists</p><p className="text-sm text-ink-soft">Vendors, stock, prices, spaces, rooms, dishes, entertainment, extras and templates.</p></div>
                  </Card>
                </Link>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
