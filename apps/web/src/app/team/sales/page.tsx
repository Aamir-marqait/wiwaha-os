import { formatSlot } from "@wiwaha/agents";
import { formatDateTimeIST } from "@wiwaha/db";
import { Badge, Card, CardHeader, PageTitle, Stat } from "@wiwaha/ui";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { SOURCE_LABELS } from "@/components/lead-badges";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markReplyPosted } from "./actions";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Sales" };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function SalesPage() {
  await requireStaff(["owner", "sales"]);
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [funnel, calls, visits, reviews, outbox] = await Promise.all([
    supabase.from("sales_funnel").select("*"),
    supabase.from("calls").select("status, direction, handled_by, handed_over").eq("direction", "inbound").gte("started_at", since),
    supabase.from("visits").select("id, lead_id, scheduled_at, status, attendees, lead:leads(contact:contacts(full_name))").gte("scheduled_at", new Date().toISOString()).eq("status", "scheduled").order("scheduled_at").limit(10),
    supabase.from("external_reviews").select("*").order("created_at", { ascending: false }).limit(12),
    supabase.from("outbox").select("id, kind, provider, to_address, status, created_at, body").order("created_at", { ascending: false }).limit(15),
  ]);
  const rows = (funnel.data ?? []) as { source: string; enquiries: number; visits: number; bookings: number; median_first_reply_minutes: number | null }[];
  const total = rows.reduce((a, r) => ({ e: a.e + r.enquiries, v: a.v + r.visits, b: a.b + r.bookings }), { e: 0, v: 0, b: 0 });
  const c = calls.data ?? [];
  const answered = c.filter((x) => ["completed", "transferred", "in_progress"].includes(x.status as string)).length;
  const replyTimes = rows.map((r) => r.median_first_reply_minutes).filter((x): x is number => x !== null);

  return (
    <>
      <PageTitle title="Sales" subtitle="Every channel, every call, every visit — by source" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Enquiries" value={total.e} hint="all time" />
        <Stat label="Enquiry → visit" value={pct(total.v, total.e)} hint={`${total.v} visits`} tone="gold" />
        <Stat label="Visit → booking" value={pct(total.b, total.v)} hint={`${total.b} bookings`} tone="burgundy" />
        <Stat label="Calls answered" value={c.length ? pct(answered, c.length) : "—"} hint={`${c.length} inbound, 30 days`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Funnel by source" subtitle={replyTimes.length ? `Median first reply ${Math.round(Math.min(...replyTimes))}–${Math.round(Math.max(...replyTimes))} min across sources` : "Reply times appear once replies are sent"} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-ink-soft"><tr><th className="px-4 py-2 font-medium">Source</th><th className="px-2 py-2 text-right font-medium">Enquiries</th><th className="px-2 py-2 text-right font-medium">Visits</th><th className="px-2 py-2 text-right font-medium">Bookings</th><th className="px-2 py-2 text-right font-medium">Conversion</th><th className="px-4 py-2 text-right font-medium">1st reply</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.sort((a, b) => b.enquiries - a.enquiries).map((r) => (
                    <tr key={r.source}><td className="px-4 py-2">{SOURCE_LABELS[r.source] ?? r.source}</td><td className="px-2 py-2 text-right">{r.enquiries}</td><td className="px-2 py-2 text-right">{r.visits}</td><td className="px-2 py-2 text-right">{r.bookings}</td><td className="px-2 py-2 text-right">{pct(r.bookings, r.enquiries)}</td><td className="px-4 py-2 text-right">{r.median_first_reply_minutes !== null ? `${Math.round(r.median_first_reply_minutes)} min` : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Reviews" subtitle="Reputation drafts every reply; nothing is posted without approval" />
            <ul className="divide-y divide-line">
              {(reviews.data ?? []).length === 0 ? <li className="px-4 py-4 text-sm text-ink-soft sm:px-5">No reviews yet.</li> : null}
              {(reviews.data ?? []).map((r) => (
                <li key={r.id as string} className="px-4 py-3 text-sm sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{"★".repeat((r.rating as number) ?? 0)} {r.author_name as string} <span className="text-xs font-normal capitalize text-ink-soft">· {r.platform as string}</span></p>
                    <Badge tone={r.reply_status === "approved" ? "sage" : r.reply_status === "drafted" ? "gold" : "neutral"}>{String(r.reply_status)}</Badge>
                  </div>
                  <p className="mt-1 text-ink-soft">{r.body as string}</p>
                  {r.reply_draft ? <p className="mt-2 whitespace-pre-line rounded-lg bg-ivory-100 px-3 py-2 text-xs">{r.reply_draft as string}</p> : null}
                  {r.reply_status === "approved" ? <div className="mt-2"><ActionButton action={markReplyPosted.bind(null, r.id as string)}>I've posted it</ActionButton></div> : null}
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
          <Card className="p-4 sm:p-5">
            <h2 className="font-serif text-xl font-semibold">Add a review</h2>
            <div className="mt-3"><ReviewForm /></div>
          </Card>
          <Card className="p-4 sm:p-5">
            <h2 className="font-serif text-xl font-semibold">Sent recently</h2>
            <ul className="mt-2 space-y-2 text-xs">
              {(outbox.data ?? []).map((o) => (
                <li key={o.id as string} className="rounded-lg bg-ivory-100 px-3 py-2">
                  <p className="font-medium capitalize">{o.kind as string} → {o.to_address as string} <Badge tone={o.status === "sandboxed" ? "gold" : o.status === "failed" ? "burgundy" : "sage"}>{o.status === "sandboxed" ? "sandbox" : String(o.status)}</Badge></p>
                  <p className="text-ink-soft">{formatDateTimeIST(o.created_at as string)}</p>
                  {o.body ? <p className="mt-1 line-clamp-2">{o.body as string}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
