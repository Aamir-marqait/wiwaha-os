import { Badge, Card, CardHeader, PageTitle, Stat, buttonClass, cn } from "@wiwaha/ui";
import { formatDateIST, rupees, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COST_LABELS } from "@/lib/costs";
import { deleteCost } from "./actions";
import { CostForm } from "./cost-form";

export const metadata = { title: "Finance" };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** The one money page: what came in, what went out, what's left, and a place to add a cost. */
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireSection("accounts", ["owner", "accounts"]);
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayIST().slice(0, 7);
  const from = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  const supabase = await createClient();
  const [paid, costs, profit, invoices, weddings] = await Promise.all([
    supabase.from("payments").select("id, label, amount_paise, paid_amount_paise, paid_at, wedding:weddings(title)").eq("status", "paid").gte("paid_at", `${from}T00:00:00+05:30`).lt("paid_at", `${next}T00:00:00+05:30`).order("paid_at", { ascending: false }),
    supabase.from("cost_entries").select("id, category, amount_paise, description, incurred_on, wedding:weddings(title)").gte("incurred_on", from).lt("incurred_on", next).order("incurred_on", { ascending: false }),
    supabase.from("wedding_profit").select("*").order("event_start", { ascending: false }).limit(20),
    supabase.from("invoices").select("id, number, kind, status, issued_on, total_paise, balance_paise, wedding:weddings(title)").order("created_at", { ascending: false }).limit(20),
    supabase.from("weddings").select("id, title").order("event_start", { ascending: false }).limit(50),
  ]);
  const money = (p: { paid_amount_paise: unknown; amount_paise: unknown }) => Number(p.paid_amount_paise ?? p.amount_paise);
  const moneyIn = (paid.data ?? []).reduce((s, p) => s + money(p), 0);
  const moneyOut = (costs.data ?? []).reduce((s, c) => s + Number(c.amount_paise), 0);
  const byCat = new Map<string, number>();
  for (const c of costs.data ?? []) byCat.set(c.category as string, (byCat.get(c.category as string) ?? 0) + Number(c.amount_paise));
  const left = moneyIn - moneyOut;
  type Line = { key: string; day: string; kind: "in" | "out"; text: string; sub: string; paise: number; costId?: string };
  const lines: Line[] = [
    ...(paid.data ?? []).map((p): Line => ({ key: `p${p.id as string}`, day: String(p.paid_at).slice(0, 10), kind: "in", text: (one(p.wedding as { title: string } | { title: string }[] | null)?.title ?? "Payment"), sub: p.label as string, paise: money(p) })),
    ...(costs.data ?? []).map((c): Line => ({ key: `c${c.id as string}`, day: c.incurred_on as string, kind: "out", text: COST_LABELS[c.category as string] ?? (c.category as string), sub: [one(c.wedding as { title: string } | { title: string }[] | null)?.title ?? "Estate", c.description as string | null].filter(Boolean).join(" · "), paise: Number(c.amount_paise), costId: c.id as string })),
  ].sort((a, b) => b.day.localeCompare(a.day));
  return (
    <>
      <PageTitle title="Finance" subtitle="Money in, money out and what's left, month by month." action={<a href={`/api/finance/export?month=${month}&format=tally_csv`} className={buttonClass("secondary", "sm")}>Export {month}</a>} />
      <div className="mb-4 flex items-center gap-1 self-start rounded-full bg-white p-1 ring-1 ring-line sm:w-fit">
        <Link href={`/team/finance?month=${shiftMonth(month, -1)}`} className="rounded-full px-3 py-1 text-sm hover:bg-ivory-100" aria-label="Previous month">←</Link>
        <span className="min-w-36 flex-1 text-center font-serif text-lg font-semibold">{formatDateIST(from, { month: "long", year: "numeric" })}</span>
        <Link href={`/team/finance?month=${shiftMonth(month, 1)}`} className="rounded-full px-3 py-1 text-sm hover:bg-ivory-100" aria-label="Next month">→</Link>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Money in" value={rupees(moneyIn, { compact: true })} tone="sage" hint={`${(paid.data ?? []).length} payment${(paid.data ?? []).length === 1 ? "" : "s"}`} />
        <Stat label="Money out" value={rupees(moneyOut, { compact: true })} tone="burgundy" hint={`${(costs.data ?? []).length} cost${(costs.data ?? []).length === 1 ? "" : "s"}`} />
        <Stat label="Left over" value={rupees(left, { compact: true })} tone={left < 0 ? "burgundy" : "gold"} hint={left < 0 ? "More went out than came in" : "In minus out"} />
      </div>
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Add a cost" subtitle="Any money that went out: ads, salaries, diesel, or one wedding's costs" />
            <div className="px-4 py-3 sm:px-5"><CostForm weddings={(weddings.data ?? []).map((w) => ({ id: w.id as string, title: w.title as string }))} /></div>
          </Card>
          <Card>
            <CardHeader title="Where it went" subtitle="Costs by type this month" />
            <ul className="divide-y divide-line/70">
              {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between gap-2 px-4 py-2 text-sm sm:px-5"><span>{COST_LABELS[k] ?? k}</span><span className="tabular-nums">{rupees(v)}</span></li>)}
              {byCat.size === 0 ? <li className="px-4 py-3 text-sm text-ink-soft sm:px-5">No costs recorded this month.</li> : null}
            </ul>
          </Card>
        </div>
        <Card>
          <CardHeader title="This month, line by line" subtitle="Payments received and costs, newest first" />
          <ul className="divide-y divide-line/70">
            {lines.length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Nothing yet this month.</li> : null}
            {lines.map((l) => (
              <li key={l.key} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium"><Badge tone={l.kind === "in" ? "sage" : "burgundy"}>{l.kind === "in" ? "in" : "out"}</Badge><span className="truncate">{l.text}</span></p>
                  <p className="truncate text-xs text-ink-soft">{formatDateIST(l.day, { day: "numeric", month: "short" })} · {l.sub}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <span className={cn("tabular-nums text-sm font-semibold", l.kind === "in" ? "text-sage-700" : "text-burgundy-700")}>{l.kind === "in" ? "+" : "−"}{rupees(l.paise)}</span>
                  {l.costId ? <ActionButton action={deleteCost.bind(null, l.costId)} variant="ghost" confirm="Delete this cost?">Delete</ActionButton> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <details className="mt-5 rounded-2xl border border-line bg-white p-4">
        <summary className="cursor-pointer font-medium text-sage-800">Profit by wedding</summary>
        <ul className="mt-2 divide-y divide-line/70">
          {(profit.data ?? []).map((p) => (
            <li key={p.wedding_id as string} className="flex items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/team/weddings/${p.wedding_id as string}`} className="min-w-0 truncate hover:underline">{p.title as string}</Link>
              <span className="shrink-0 tabular-nums text-xs">{rupees(Number(p.revenue_paise), { compact: true })} − {rupees(Number(p.cost_paise), { compact: true })} = <strong className="text-sm">{rupees(Number(p.profit_paise), { compact: true })}</strong></span>
            </li>
          ))}
          {(profit.data ?? []).length === 0 ? <li className="py-2 text-sm text-ink-soft">No weddings yet.</li> : null}
        </ul>
      </details>
      <details className="mt-3 rounded-2xl border border-line bg-white p-4">
        <summary className="cursor-pointer font-medium text-sage-800">Invoices</summary>
        <ul className="mt-2 divide-y divide-line/70">
          {(invoices.data ?? []).length === 0 ? <li className="py-2 text-sm text-ink-soft">Invoices appear after each event, or from a wedding&rsquo;s Payments tab when needed sooner.</li> : null}
          {(invoices.data ?? []).map((i) => {
            const w = one(i.wedding as { title: string } | { title: string }[] | null);
            return (
              <li key={i.id as string} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0"><p className="text-sm font-medium">{i.number as string} <span className="text-xs uppercase text-ink-soft">{i.kind as string}</span> · <a href={`/api/finance/invoice/${i.id as string}`} target="_blank" rel="noreferrer" className="text-xs font-normal text-sage-700 underline">PDF</a></p><p className="text-xs text-ink-soft">{w?.title} · {formatDateIST(i.issued_on as string)} · {rupees(Number(i.total_paise))}{Number(i.balance_paise) > 0 ? ` · balance ${rupees(Number(i.balance_paise))}` : ""}</p></div>
                <Badge tone={i.status === "issued" || i.status === "paid" ? "solid" : i.status === "pending_approval" ? "burgundy" : "neutral"}>{String(i.status).replace(/_/g, " ")}</Badge>
              </li>
            );
          })}
        </ul>
      </details>
    </>
  );
}
