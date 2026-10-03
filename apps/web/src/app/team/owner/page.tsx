import { Card, CardHeader, PageTitle, Stat } from "@wiwaha/ui";
import { addDays, formatDateIST, rupees, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Numbers" };

interface Numbers { new_enquiries: number; visits_booked: number; bookings: number; revenue_collected_paise: number; dues_paise: number; overdue_paise: number }

/** Prashanth's dashboard: the five morning numbers, the booking calendar, approvals and profit. */
export default async function OwnerPage() {
  await requireStaff(["owner"]);
  const supabase = await createClient();
  const today = todayIST();
  const [nums, approvals, bookings, profit] = await Promise.all([
    supabase.rpc("owner_numbers", { p_day: today }),
    supabase.from("approvals").select("id, kind", { count: "exact" }).eq("status", "pending"),
    supabase.from("calendar_entries").select("id, starts_on, ends_on, status, label, space:spaces(name), wedding_id").in("status", ["confirmed", "held"]).gte("ends_on", today).lte("starts_on", addDays(today, 120)).order("starts_on"),
    supabase.from("wedding_profit").select("*").order("event_start", { ascending: false }).limit(24),
  ]);
  const n = ((Array.isArray(nums.data) ? nums.data[0] : nums.data) ?? null) as Numbers | null;
  const rows = (profit.data ?? []) as { wedding_id: string; title: string; event_start: string; revenue_paise: number; cost_paise: number; profit_paise: number }[];
  const byMonth = new Map<string, { revenue: number; cost: number; profit: number }>();
  for (const r of rows) {
    const k = r.event_start.slice(0, 7);
    const m = byMonth.get(k) ?? { revenue: 0, cost: 0, profit: 0 };
    byMonth.set(k, { revenue: m.revenue + Number(r.revenue_paise), cost: m.cost + Number(r.cost_paise), profit: m.profit + Number(r.profit_paise) });
  }
  const kinds = (approvals.data ?? []).reduce<Record<string, number>>((m, a) => ({ ...m, [a.kind as string]: (m[a.kind as string] ?? 0) + 1 }), {});

  return (
    <>
      <PageTitle title="Good morning, Prashanth" subtitle={`Yesterday's numbers · ${formatDateIST(addDays(today, -1), { weekday: "long", day: "numeric", month: "long" })}`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="New enquiries" value={n?.new_enquiries ?? "—"} hint={<Link href="/team/leads" className="underline">Inbox</Link>} />
        <Stat label="Visits booked" value={n?.visits_booked ?? "—"} tone="gold" />
        <Stat label="Bookings" value={n?.bookings ?? "—"} />
        <Stat label="Revenue collected" value={n ? rupees(Number(n.revenue_collected_paise), { compact: true }) : "—"} tone="gold" />
        <Stat label="Dues (next 30 days)" value={n ? rupees(Number(n.dues_paise), { compact: true }) : "—"} tone={n && Number(n.overdue_paise) > 0 ? "burgundy" : "sage"} hint={n && Number(n.overdue_paise) > 0 ? `${rupees(Number(n.overdue_paise), { compact: true })} overdue` : "Nothing overdue"} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Waiting for you" subtitle={`${approvals.count ?? 0} approvals`} action={<Link href="/team/approvals" className="text-sm text-sage-700 underline">Open queue</Link>} />
          <ul className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
            {Object.entries(kinds).map(([k, c]) => <li key={k} className="rounded-full bg-ivory-100 px-3 py-1 text-sm capitalize">{k.replace(/_/g, " ")} · {c}</li>)}
            {Object.keys(kinds).length === 0 ? <li className="text-sm text-ink-soft">Nothing waiting.</li> : null}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Booking calendar" subtitle="Next 120 days" action={<Link href="/team/calendar" className="text-sm text-sage-700 underline">Full calendar</Link>} />
          <ul className="divide-y divide-line/70">
            {(bookings.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No bookings or holds yet.</li> : null}
            {(bookings.data ?? []).slice(0, 12).map((b) => {
              const s = (Array.isArray(b.space) ? b.space[0] : b.space) as { name: string } | null;
              return (
                <li key={b.id as string} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                  <span className="min-w-0"><span className="font-medium">{formatDateIST(b.starts_on as string, { day: "numeric", month: "short" })}{b.ends_on !== b.starts_on ? `–${formatDateIST(b.ends_on as string, { day: "numeric", month: "short" })}` : ""}</span> · {(b.label as string | null) ?? "Booking"}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{s?.name} · {b.status as string}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Profit by month" subtitle="Collected revenue minus recorded costs, by event month" />
          <ul className="divide-y divide-line/70">
            {[...byMonth.entries()].map(([m, v]) => (
              <li key={m} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                <span>{formatDateIST(`${m}-01`, { month: "long", year: "numeric" })}</span>
                <span className="tabular-nums">{rupees(v.revenue, { compact: true })} − {rupees(v.cost, { compact: true })} = <strong>{rupees(v.profit, { compact: true })}</strong></span>
              </li>
            ))}
            {byMonth.size === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No weddings yet.</li> : null}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Profit by wedding" action={<Link href="/team/finance" className="text-sm text-sage-700 underline">Finance</Link>} />
          <ul className="divide-y divide-line/70">
            {rows.map((r) => (
              <li key={r.wedding_id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                <Link href={`/team/weddings/${r.wedding_id}`} className="min-w-0 truncate hover:underline">{r.title} <span className="text-xs text-ink-soft">· {formatDateIST(r.event_start, { month: "short", year: "numeric" })}</span></Link>
                <span className="shrink-0 tabular-nums">{rupees(Number(r.profit_paise), { compact: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
