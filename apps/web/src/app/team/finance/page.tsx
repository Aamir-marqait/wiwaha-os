import { Badge, Card, CardHeader, PageTitle, buttonClass } from "@wiwaha/ui";
import { formatDateIST, rupees, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COST_LABELS } from "@/lib/costs";
import { CostForm } from "./cost-form";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  await requireSection("accounts", ["owner", "accounts"]);
  const supabase = await createClient();
  const month = todayIST().slice(0, 7);
  const [invoices, costs, profit, weddings, policy, monthCosts, monthLeads] = await Promise.all([
    supabase.from("invoices").select("id, number, kind, status, issued_on, total_paise, balance_paise, wedding:weddings(title)").order("created_at", { ascending: false }).limit(30),
    supabase.from("cost_entries").select("id, category, amount_paise, description, incurred_on, wedding:weddings(title)").order("created_at", { ascending: false }).limit(15),
    supabase.from("wedding_profit").select("*").order("event_start", { ascending: false }).limit(20),
    supabase.from("weddings").select("id, title").order("event_start", { ascending: false }).limit(50),
    supabase.from("policies").select("value").eq("key", "finance.gst").maybeSingle(),
    supabase.from("cost_entries").select("category, amount_paise").gte("incurred_on", `${month}-01`),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", `${month}-01T00:00:00+05:30`),
  ]);
  const byCat = new Map<string, number>();
  for (const c of monthCosts.data ?? []) byCat.set(c.category as string, (byCat.get(c.category as string) ?? 0) + Number(c.amount_paise));
  const monthTotal = [...byCat.values()].reduce((a, b) => a + b, 0);
  const ads = byCat.get("marketing") ?? 0;
  const enquiries = monthLeads.count ?? 0;
  const format = ((policy.data?.value ?? {}) as { export_format?: string }).export_format ?? "tally_csv";
  return (
    <>
      <PageTitle title="Finance" subtitle="Final and GST invoices are prepared by the Finance agent after each event; you approve them." action={<a href={`/api/finance/export?month=${month}&format=${format}`} className={buttonClass("secondary", "sm")}>Export {month} ({format === "tally_csv" ? "Tally" : "Zoho"})</a>} />
      <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader title="Invoices" />
          <ul className="divide-y divide-line/70">
            {(invoices.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Invoices appear after each event, or from a wedding&rsquo;s Payments tab when needed sooner.</li> : null}
            {(invoices.data ?? []).map((i) => {
              const w = (Array.isArray(i.wedding) ? i.wedding[0] : i.wedding) as { title: string } | null;
              return (
                <li key={i.id as string} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0"><p className="text-sm font-medium">{i.number as string} <span className="text-xs uppercase text-ink-soft">{i.kind as string}</span> · <a href={`/api/finance/invoice/${i.id as string}`} target="_blank" rel="noreferrer" className="text-xs font-normal text-sage-700 underline">PDF</a></p><p className="text-xs text-ink-soft">{w?.title} · {formatDateIST(i.issued_on as string)} · {rupees(Number(i.total_paise))}{Number(i.balance_paise) > 0 ? ` · balance ${rupees(Number(i.balance_paise))}` : ""}</p></div>
                  <Badge tone={i.status === "issued" || i.status === "paid" ? "solid" : i.status === "pending_approval" ? "burgundy" : "neutral"}>{String(i.status).replace(/_/g, " ")}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Profit by wedding" subtitle="Collected revenue minus recorded costs" />
          <ul className="divide-y divide-line/70">
            {(profit.data ?? []).map((p) => (
              <li key={p.wedding_id as string} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                <Link href={`/team/weddings/${p.wedding_id as string}`} className="min-w-0 truncate hover:underline">{p.title as string}</Link>
                <span className="shrink-0 tabular-nums text-xs">{rupees(Number(p.revenue_paise), { compact: true })} − {rupees(Number(p.cost_paise), { compact: true })} = <strong className="text-sm">{rupees(Number(p.profit_paise), { compact: true })}</strong></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={`Costs this month · ${rupees(monthTotal)}`} subtitle={ads ? `Ads & marketing ${rupees(ads)}${enquiries ? ` · about ${rupees(Math.round(ads / enquiries))} per enquiry (${enquiries} this month)` : ""}` : "No ad spend recorded this month."} />
          <ul className="divide-y divide-line/70">
            {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between gap-2 px-4 py-2 text-sm sm:px-5"><span>{COST_LABELS[k] ?? k}</span><span className="tabular-nums">{rupees(v)}</span></li>)}
            {byCat.size === 0 ? <li className="px-4 py-3 text-sm text-ink-soft sm:px-5">Nothing recorded yet this month.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Add a cost" subtitle="Ads, salaries, diesel, or one wedding's costs" />
          <div className="px-4 py-3 sm:px-5"><CostForm weddings={(weddings.data ?? []).map((w) => ({ id: w.id as string, title: w.title as string }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Recent costs" />
          <ul className="divide-y divide-line/70">
            {(costs.data ?? []).map((c) => {
              const w = (Array.isArray(c.wedding) ? c.wedding[0] : c.wedding) as { title: string } | null;
              return <li key={c.id as string} className="flex justify-between gap-2 px-4 py-2 text-sm sm:px-5"><span className="min-w-0 truncate">{COST_LABELS[c.category as string] ?? (c.category as string)} · {w?.title ?? "Estate"}{c.description ? ` · ${c.description as string}` : ""}</span><span className="shrink-0 tabular-nums">{rupees(Number(c.amount_paise))}</span></li>;
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
