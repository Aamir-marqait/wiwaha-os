import { Card, PageTitle } from "@wiwaha/ui";
import Link from "next/link";
import { requireStaff, viewerSections } from "@/lib/auth";
import { visibleGroups } from "@/lib/nav";

export const metadata = { title: "More" };

const BLURBS: Record<string, string> = {
  "/team/leads": "Every enquiry and where it stands.",
  "/team/sales": "Funnel by source, why leads didn't book, visits.",
  "/team/studio": "Posts, carousels and reels from the estate's own photos.",
  "/team/calendar": "Every space, hold and booking.",
  "/team/estate": "Maintenance, stock, purchases and readings.",
  "/team/weddings": "Every wedding, by stage.",
  "/team/vendors": "Every vendor, their details, and who they're booked for.",
  "/team/finance": "Invoices, costs, profit and Tally export.",
  "/team/owner": "The five morning numbers, bookings and profit.",
  "/team/clients": "Couples' and families' portal logins.",
  "/team/leads/import": "Bring in leads from Meta, Google or a spreadsheet.",
  "/team/catalogue/spaces": "Lawns, halls and other spaces.",
  "/team/catalogue/rooms": "Guest rooms.",
  "/team/weddings/new": "Book a walk-in, call or referral.",
  "/team/decor": "Every piece we own, with photos, count and condition.",
  "/team/decor/templates": "Sample moodboards, area by area.",
  "/team/decor/assignments": "Which décor goes to which event and area.",
  "/team/catalogue/vendors": "Add and edit vendors.",
  "/team/settings/links": "Login and guest links to share.",
  "/team/settings/claude": "Use Wiwaha OS from Claude.",
  "/team/settings/lists": "Every list the team maintains.",
  "/team/settings/team": "Invite people and choose what each sees.",
  "/team/spaces": "Every space and area, with photos for moodboards and posts.",
  "/team/tasks": "To-dos for you and the team; tick them off when done.",
  "/team/approvals": "Things waiting for your OK: quotes, invoices, moodboards.",
  "/team/outbox": "Approved emails waiting to be sent.",
  "/team/settings": "Policy book, lists, links, agents and the activity log.",
};
const IN_BOTTOM_BAR = new Set(["/team"]);

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

            </div>
          </section>
        ))}
      </div>
    </>
  );
}
