import { Badge, Card } from "@wiwaha/ui";
import { formatDateIST, rupees } from "@wiwaha/db";
import { ActionButton } from "@/components/action-button";
import { approveQuote } from "../actions";
import { loadPortal } from "../_ui/load";
import { PortalShell } from "../_ui/shell";

export const metadata = { title: "Your quote" };

export default async function QuotePage() {
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const w = wedding!;
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  const [{ data: q }, { data: vendors }] = await Promise.all([
    supabase.from("quotes").select("id, version, status, subtotal_paise, tax_paise, total_paise, valid_until, lines:quote_lines(id, description, quantity, unit_price_paise, line_total_paise, gst_rate_bps, sort)").eq("wedding_id", w.id).in("status", ["sent", "client_approved"]).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("vendor_bookings").select("id, status, vendor:vendors(category)").eq("wedding_id", w.id),
  ]);
  const lines = ((q?.lines ?? []) as { id: string; description: string; quantity: number; unit_price_paise: number; line_total_paise: number; gst_rate_bps: number; sort: number }[]).sort((a, b) => a.sort - b.sort);
  return (
    <PortalShell t={t} wedding={w} first={first} active="quote">
      {!q ? <Card className="p-5 text-sm text-ink-soft">Your quote is prepared once your menus and décor are final. It will appear here, with every line explained.</Card> : (
        <Card>
          <div className="flex items-start justify-between gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
            <div><h2 className="font-serif text-2xl font-semibold">Quote v{q.version as number}</h2>{q.valid_until ? <p className="text-xs text-ink-soft">Valid until {formatDateIST(q.valid_until as string)}</p> : null}</div>
            <Badge tone={q.status === "client_approved" ? "solid" : "gold"}>{q.status === "client_approved" ? t.approved : "For you to review"}</Badge>
          </div>
          <ul className="divide-y divide-line/70">
            {lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <div className="min-w-0"><p>{l.description}</p><p className="text-xs text-ink-soft">{l.quantity} × {rupees(l.unit_price_paise)} · GST {l.gst_rate_bps / 100}%</p></div>
                <span className="shrink-0 tabular-nums">{rupees(l.line_total_paise)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-line px-4 py-3 text-right sm:px-5">
            <p className="text-sm text-ink-soft">Subtotal {rupees(Number(q.subtotal_paise))} · GST {rupees(Number(q.tax_paise))}</p>
            <p className="font-serif text-2xl font-semibold">{rupees(Number(q.total_paise))}</p>
            {q.status === "sent" && me?.can_approve ? <div className="pt-2"><ActionButton action={approveQuote.bind(null, q.id as string)} variant="primary" size="md" confirm="Approve this quote? We'll then confirm your vendors.">{t.approve}</ActionButton></div> : null}
          </div>
        </Card>
      )}
      {(vendors ?? []).length ? (
        <Card className="p-4 sm:p-5">
          <h2 className="font-serif text-xl font-semibold">Your vendors</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(vendors ?? []).filter((b) => b.status !== "declined").map((b) => {
              const v = (Array.isArray(b.vendor) ? b.vendor[0] : b.vendor) as { category: string } | null;
              return <li key={b.id as string} className="flex justify-between"><span className="capitalize">{v?.category}</span><span className="text-ink-soft">{b.status === "confirmed" ? "Confirmed" : "Being confirmed"}</span></li>;
            })}
          </ul>
        </Card>
      ) : null}
    </PortalShell>
  );
}
