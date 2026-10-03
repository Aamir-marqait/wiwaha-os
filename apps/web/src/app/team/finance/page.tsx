import { Badge, Card, CardHeader, PageTitle, buttonClass } from "@wiwaha/ui";
import { formatDateIST, rupees, todayIST } from "@wiwaha/db";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CostForm } from "./cost-form";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  await requireStaff(["owner", "accounts"]);
  const supabase = await createClient();
  const month = todayIST().slice(0, 7);
  const [invoices, costs, profit, weddings, policy] = await Promise.all([
    supabase.from("invoices").select("id, number, kind, status, issued_on, total_paise, balance_paise, wedding:weddings(title)").order("created_at", { ascending: false }).limit(30),
    supabase.from("cost_entries").select("id, category, amount_paise, description, incurred_on, wedding:weddings(title)").order("created_at", { ascending: false }).limit(15),
    supabase.from("wedding_profit").select("*").order("event_start", { ascending: false }).limit(20),
    supabase.from("weddings").select("id, title").order("event_start", { ascending: false }).limit(50),
    supabase.from("policies").select("value").eq("key", "finance.gst").maybeSingle(),
  ]);
  const format = ((policy.data?.value ?? {}) as { export_format?: string }).export_format ?? "tally_csv";
  return (
    <>
      <PageTitle title="Finance" subtitle="Final and GST invoices are prepared by the Finance agent after each event; you approve them." action={<a href={`/api/finance/export?month=${month}&format=${format}`} className={buttonClass("secondary", "sm")}>Export {month} ({format === "tally_csv" ? "Tally" : "Zoho"})</a>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Invoices" />
          <ul className="divide-y divide-line/70">
            {(invoices.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">Invoices appear after the first event.</li> : null}
            {(invoices.data ?? []).map((i) => {
              const w = (Array.isArray(i.wedding) ? i.wedding[0] : i.wedding) as { title: string } | null;
              return (
                <li key={i.id as string} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0"><p className="text-sm font-medium">{i.number as string} <span className="text-xs uppercase text-ink-soft">{i.kind as string}</span></p><p className="text-xs text-ink-soft">{w?.title} · {formatDateIST(i.issued_on as string)} · {rupees(Number(i.total_paise))}{Number(i.balance_paise) > 0 ? ` · balance ${rupees(Number(i.balance_paise))}` : ""}</p></div>
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
          <CardHeader title="Add a cost" subtitle="Staff, food, décor, vendors, diesel… per wedding" />
          <div className="px-4 py-3 sm:px-5"><CostForm weddings={(weddings.data ?? []).map((w) => ({ id: w.id as string, title: w.title as string }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Recent costs" />
          <ul className="divide-y divide-line/70">
            {(costs.data ?? []).map((c) => {
              const w = (Array.isArray(c.wedding) ? c.wedding[0] : c.wedding) as { title: string } | null;
              return <li key={c.id as string} className="flex justify-between gap-2 px-4 py-2 text-sm sm:px-5"><span className="min-w-0 truncate">{w?.title ?? "Estate"} · {c.category as string}{c.description ? ` · ${c.description as string}` : ""}</span><span className="shrink-0 tabular-nums">{rupees(Number(c.amount_paise))}</span></li>;
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
