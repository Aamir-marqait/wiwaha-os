import { Badge, Card, CardHeader, PageTitle, buttonClass } from "@wiwaha/ui";
import { formatDateIST, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Vendors" };

type Booking = { id: string; status: string; vendor_id: string; wedding: { id: string; title: string; event_start: string } | { id: string; title: string; event_start: string }[] | null };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const TONE: Record<string, "sage" | "gold" | "burgundy" | "neutral"> = { confirmed: "sage", requested: "gold", declined: "burgundy", cancelled: "neutral", completed: "neutral" };

/** Vendor management: who we work with, and what each is booked for. */
export default async function VendorsPage() {
  const viewer = await requireSection("vendors");
  const supabase = await createClient();
  const [vendors, bookings] = await Promise.all([
    supabase.from("vendors").select("id, name, category, contact_name, phone_e164, email, preferred, designated_planner, active").order("category").order("name"),
    supabase.from("vendor_bookings").select("id, status, vendor_id, wedding:weddings(id, title, event_start)").in("status", ["requested", "confirmed"]),
  ]);
  const today = todayIST();
  const upcoming = new Map<string, { id: string; status: string; wedding: { id: string; title: string; event_start: string } }[]>();
  for (const b of (bookings.data ?? []) as Booking[]) {
    const w = one(b.wedding);
    if (!w || w.event_start < today) continue;
    upcoming.set(b.vendor_id, [...(upcoming.get(b.vendor_id) ?? []), { id: b.id, status: b.status, wedding: w }]);
  }
  const byCategory = new Map<string, NonNullable<typeof vendors.data>>();
  for (const v of vendors.data ?? []) byCategory.set(v.category as string, [...(byCategory.get(v.category as string) ?? []), v]);
  const canEdit = ["owner", "event_manager"].includes(viewer.profile.role);

  return (
    <>
      <PageTitle title="Vendors" subtitle="Who we work with, and which weddings each is booked for."
        action={canEdit ? <Link href="/team/catalogue/vendors" className={buttonClass("primary", "sm")}>Add or edit vendors</Link> : undefined} />
      {byCategory.size === 0 ? <Card className="p-5 text-sm text-ink-soft">No vendors yet.</Card> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {[...byCategory.entries()].map(([category, list]) => (
          <Card key={category}>
            <CardHeader title={category.charAt(0).toUpperCase() + category.slice(1)} subtitle={`${list.length} vendor${list.length === 1 ? "" : "s"}`} />
            <ul className="divide-y divide-line/70">
              {list.map((v) => {
                const jobs = (upcoming.get(v.id as string) ?? []).sort((a, b) => a.wedding.event_start.localeCompare(b.wedding.event_start));
                return (
                  <li key={v.id as string} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{v.name as string}</p>
                      {v.preferred ? <Badge tone="gold">Preferred</Badge> : null}
                      {v.designated_planner ? <Badge tone="sage">Designated planner</Badge> : null}
                      {!v.active ? <Badge tone="neutral">Inactive</Badge> : null}
                    </div>
                    <p className="text-xs text-ink-soft">{[v.contact_name, v.phone_e164, v.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                    {jobs.length ? (
                      <ul className="mt-2 space-y-1">
                        {jobs.map((j) => (
                          <li key={j.id} className="flex items-center gap-2 text-sm">
                            <Badge tone={TONE[j.status] ?? "neutral"}>{j.status}</Badge>
                            <Link href={`/team/weddings/${j.wedding.id}`} className="text-sage-700 hover:underline">{j.wedding.title}</Link>
                            <span className="text-xs text-ink-soft">{formatDateIST(j.wedding.event_start)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-1 text-xs text-ink-soft">No upcoming bookings.</p>}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
