import { Badge, Card, CardHeader, cn } from "@wiwaha/ui";
import { formatDateIST, rupees } from "@wiwaha/db";
import { ActionButton } from "@/components/action-button";
import type { createClient } from "@/lib/supabase/server";
import { decideCosting } from "./actions";
import { RepriceForm } from "./panel-forms";

type Supa = Awaited<ReturnType<typeof createClient>>;
interface Line { id: string; description: string; quantity: number; unit_price_paise: number; line_total_paise: number; gst_rate_bps: number; off_book: boolean; sort: number; prescribed_unit_paise: number | null; unit_cost_paise: number | null }
type RawLine = Omit<Line, "prescribed_unit_paise" | "unit_cost_paise"> & { costing: { prescribed_unit_paise: number | null; unit_cost_paise: number | null } | { prescribed_unit_paise: number | null; unit_cost_paise: number | null }[] | null };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/**
 * Prashanth's internal costing: for every line, the price agreed with the
 * couple next to the prescribed rate and our cost. He can change any price
 * before approving; approving sends the quote to the couple for their consent.
 */
export async function CostingCard({ supabase, weddingId, role }: { supabase: Supa; weddingId: string; role: string }) {
  const { data: quotes } = await supabase.from("quotes")
    .select("id, version, status, subtotal_paise, tax_paise, total_paise, valid_until, approval_id, lines:quote_lines(id, description, quantity, unit_price_paise, line_total_paise, gst_rate_bps, off_book, sort, costing:quote_line_costs(prescribed_unit_paise, unit_cost_paise))")
    .eq("wedding_id", weddingId).order("version", { ascending: false }).limit(1);
  const q = (quotes ?? [])[0] as { id: string; version: number; status: string; subtotal_paise: number; tax_paise: number; total_paise: number; valid_until: string | null; approval_id: string | null; lines: RawLine[] } | undefined;
  if (!q) {
    return (
      <Card>
        <CardHeader title="Costing" subtitle="Prepared once menus, décor, entertainment and extras are final" />
        <p className="px-5 py-4 text-sm text-ink-soft">Nothing to cost yet.</p>
      </Card>
    );
  }
  const lines: Line[] = [...q.lines].sort((a, b) => a.sort - b.sort).map(({ costing, ...l }) => {
    const c = Array.isArray(costing) ? costing[0] ?? null : costing;
    return { ...l, prescribed_unit_paise: c?.prescribed_unit_paise ?? null, unit_cost_paise: c?.unit_cost_paise ?? null };
  });
  const editable = role === "owner" && q.status === "pending_approval";
  const revenue = lines.reduce((a, l) => a + l.line_total_paise, 0);
  const known = lines.filter((l) => l.unit_cost_paise != null);
  const knownRevenue = known.reduce((a, l) => a + l.line_total_paise, 0);
  const cost = known.reduce((a, l) => a + Math.round((l.unit_cost_paise ?? 0) * Number(l.quantity)), 0);
  const STATUS: Record<string, string> = { pending_approval: "waiting for Prashanth", sent: "with the couple for their consent", client_approved: "the couple agreed", rejected: "sent back", superseded: "replaced" };

  return (
    <Card>
      <CardHeader title={`Costing · quote v${q.version}`} subtitle={`${STATUS[q.status] ?? q.status}${q.valid_until ? ` · valid until ${formatDateIST(q.valid_until)}` : ""}`} />
      <ul className="divide-y divide-line/70">
        {lines.map((l) => {
          const below = l.prescribed_unit_paise != null && l.unit_price_paise < l.prescribed_unit_paise;
          const lineCost = l.unit_cost_paise != null ? Math.round(l.unit_cost_paise * Number(l.quantity)) : null;
          return (
            <li key={l.id} className="px-4 py-3 text-sm sm:px-5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0">{l.description}</p>
                <span className="shrink-0 font-medium tabular-nums">{rupees(l.line_total_paise)}</span>
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-ink-soft sm:grid-cols-4">
                <div><dt className="inline">Agreed: </dt><dd className={cn("inline", below && "text-burgundy-700")}>{Number(l.quantity)} × {rupees(l.unit_price_paise)}</dd></div>
                <div><dt className="inline">Prescribed: </dt><dd className="inline">{l.prescribed_unit_paise != null ? rupees(l.prescribed_unit_paise) : "not in a list"}</dd></div>
                <div><dt className="inline">Our cost: </dt><dd className="inline">{lineCost != null ? rupees(lineCost) : "—"}</dd></div>
                <div><dt className="inline">Margin: </dt><dd className="inline">{lineCost != null ? pct(l.line_total_paise - lineCost, l.line_total_paise) : "—"}</dd></div>
              </dl>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {l.off_book ? <Badge tone="burgundy">needs price</Badge> : null}
                {below ? <Badge tone="gold">below prescribed</Badge> : null}
                {editable ? <RepriceForm weddingId={weddingId} lineId={l.id} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="space-y-0.5 border-t border-line px-4 py-3 text-right text-sm sm:px-5">
        <p className="text-ink-soft">Subtotal {rupees(revenue)} · GST {rupees(q.tax_paise)}</p>
        <p className="font-serif text-xl font-semibold">{rupees(q.total_paise)}</p>
        <p className="text-xs text-ink-soft">{known.length ? `Our cost ${rupees(cost)} on ${known.length} of ${lines.length} lines · margin ${pct(knownRevenue - cost, knownRevenue)} on those` : "Add our costs in Lists (price book, entertainment, extras) to see margins."}</p>
        {editable ? <p className="text-xs text-ink-soft">Totals are recomputed from the lines when you approve.</p> : null}
      </div>
      {editable && q.approval_id ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
          <ActionButton action={decideCosting.bind(null, weddingId, q.approval_id, "rejected")} variant="ghost" confirm="Send this costing back? Nothing goes to the couple.">Send back</ActionButton>
          <ActionButton action={decideCosting.bind(null, weddingId, q.approval_id, "approved")} variant="primary" confirm="Approve this costing? The quote goes to the couple for their consent.">Approve and send to the couple</ActionButton>
        </div>
      ) : null}
    </Card>
  );
}
