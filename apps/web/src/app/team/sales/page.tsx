import { formatSlot } from "@wiwaha/agents";
import { Card, CardHeader, PageTitle, Stat } from "@wiwaha/ui";
import Link from "next/link";
import { SOURCE_LABELS } from "@/components/lead-badges";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sales" };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function SalesPage() {
  await requireSection("sales_marketing", ["owner", "sales"]);
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [funnel, calls, visits, lostLeads] = await Promise.all([
    supabase.from("sales_funnel").select("*"),
    supabase.from("calls").select("status, direction, handled_by, handed_over").eq("direction", "inbound").gte("started_at", since),
    supabase.from("visits").select("id, lead_id, scheduled_at, status, attendees, lead:leads(contact:contacts(full_name))").gte("scheduled_at", new Date().toISOString()).eq("status", "scheduled").order("scheduled_at").limit(10),
    supabase.from("leads").select("status, lost_reason, source").in("status", ["lost", "no_response"]),
  ]);
  const rows = (funnel.data ?? []) as { source: string; enquiries: number; visits: number; bookings: number }[];
  const total = rows.reduce((a, r) => ({ e: a.e + r.enquiries, v: a.v + r.visits, b: a.b + r.bookings }), { e: 0, v: 0, b: 0 });
  const lostBy = new Map<string, number>();
  for (const l of lostLeads.data ?? []) { const r = String(l.lost_reason ?? "").replace(/^Other:\s*/, "Other: ").trim() || "No reason given"; const k = r.startsWith("Other: ") ? "Other" : r; lostBy.set(k, (lostBy.get(k) ?? 0) + 1); }
  const lostTotal = (lostLeads.data ?? []).length;
  const c = calls.data ?? [];
  const answered = c.filter((x) => ["completed", "transferred", "in_progress"].includes(x.status as string)).length;

  return (
    <>
      <PageTitle title="Sales" subtitle="Every channel, every call, every visit — by source" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Enquiries" value={total.e} hint="all time" />
        <Stat label="Enquiry → visit" value={pct(total.v, total.e)} hint={`${total.v} visits`} tone="gold" />
        <Stat label="Visit → booking" value={pct(total.b, total.v)} hint={`${total.b} bookings`} tone="burgundy" />
        <Stat label="Calls answered" value={c.length ? pct(answered, c.length) : "—"} hint={`${c.length} inbound, 30 days`} />
      </div>

      <div className="mt-5 grid gap-5 *:min-w-0 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Funnel by source" subtitle="How each lead heard about us (or how they reached us), and how many visited and booked" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead className="text-left text-xs text-ink-soft"><tr><th className="px-4 py-2 font-medium">Source</th><th className="px-2 py-2 text-right font-medium">Enquiries</th><th className="px-2 py-2 text-right font-medium">Visits</th><th className="px-2 py-2 text-right font-medium">Bookings</th><th className="px-2 py-2 text-right font-medium">Conversion</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.sort((a, b) => b.enquiries - a.enquiries).map((r) => (
                    <tr key={r.source}><td className="px-4 py-2">{SOURCE_LABELS[r.source] ?? r.source}</td><td className="px-2 py-2 text-right">{r.enquiries}</td><td className="px-2 py-2 text-right">{r.visits}</td><td className="px-2 py-2 text-right">{r.bookings}</td><td className="px-2 py-2 text-right">{pct(r.bookings, r.enquiries)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Why leads didn't book" subtitle={lostTotal ? `${lostTotal} lost or stopped responding; the reason is asked when a lead is closed` : "Reasons appear here when leads are marked lost"} />
            <ul className="space-y-2 px-4 pb-4 sm:px-5">
              {[...lostBy.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                <li key={r} className="text-sm">
                  <div className="flex justify-between gap-2"><span>{r}</span><span className="text-ink-soft">{n} · {pct(n, lostTotal)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-ivory-100"><div className="h-1.5 rounded-full bg-burgundy-600" style={{ width: `${Math.round((n / lostTotal) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <h2 className="font-serif text-xl font-semibold">Upcoming visits</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(visits.data ?? []).length === 0 ? <li className="text-ink-soft">None booked.</li> : null}
              {(visits.data ?? []).map((v) => {
                const lead = (Array.isArray(v.lead) ? v.lead[0] : v.lead) as { contact: { full_name: string } | { full_name: string }[] } | null;
                const contact = lead ? (Array.isArray(lead.contact) ? lead.contact[0] : lead.contact) : null;
                return <li key={v.id as string}><Link href={`/team/leads/${v.lead_id}`} className="font-medium hover:underline">{contact?.full_name ?? "Family"}</Link><p className="text-xs text-ink-soft">{formatSlot(v.scheduled_at as string)}{v.attendees ? ` · ${v.attendees}` : ""}</p></li>;
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
