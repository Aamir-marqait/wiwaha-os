import { Card, buttonClass, cn } from "@wiwaha/ui";
import { formatDateIST, rupees } from "@wiwaha/db";
import { loadPortal } from "../_ui/load";
import { PortalShell } from "../_ui/shell";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const w = wedding!;
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  const [{ data: payments }, { data: contract }, { data: invoices }] = await Promise.all([
    supabase.from("payments").select("id, label, amount_paise, due_on, status, link_url, receipt_number, paid_at").eq("wedding_id", w.id).order("sort"),
    supabase.from("contracts").select("id, version, status, esign_url, esign_completed_at").eq("wedding_id", w.id).in("status", ["sent", "signed"]).order("version", { ascending: false }).limit(1).maybeSingle(),
    // RLS: only issued invoices, only for members who can see payments.
    supabase.from("invoices").select("id, number, kind, issued_on, total_paise, balance_paise").eq("wedding_id", w.id).order("issued_on"),
  ]);
  return (
    <PortalShell t={t} wedding={w} first={first} active="payments">
      {contract ? (
        <Card className="flex items-center justify-between gap-3 p-4">
          <div><p className="font-serif text-lg font-semibold">Your contract</p><p className="text-xs text-ink-soft">Version {contract.version as number} · {contract.status === "signed" || contract.esign_completed_at ? "Signed" : "Waiting for your signature"}</p></div>
          {contract.esign_url && !contract.esign_completed_at ? <a href={contract.esign_url as string} className={buttonClass("primary", "sm")}>Sign</a> : null}
        </Card>
      ) : null}
      {!me?.can_view_payments ? <Card className="p-5 text-sm text-ink-soft">Payments are visible to the couple. Ask them if you need details.</Card> : (
        <Card>
          <ul className="divide-y divide-line/70">
            {(payments ?? []).map((p) => (
              <li key={p.id as string} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.label as string}</p>
                  <p className="text-xs text-ink-soft">{rupees(Number(p.amount_paise))} · {t.due} {formatDateIST(p.due_on as string)}{p.receipt_number ? ` · receipt ${p.receipt_number as string}` : ""}</p>
                </div>
                {p.status === "paid" ? <span className="rounded-full bg-sage-700 px-2.5 py-0.5 text-xs text-white">{t.paid}</span>
                  : p.link_url ? <a href={p.link_url as string} className={buttonClass("gold", "sm")}>{t.pay_now}</a>
                  : <span className={cn("rounded-full px-2.5 py-0.5 text-xs", p.status === "overdue" ? "bg-burgundy-100 text-burgundy-700" : "bg-gold-100 text-gold-700")}>{p.status === "overdue" ? "Overdue" : t.upcoming}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(invoices ?? []).length ? (
        <Card>
          <ul className="divide-y divide-line/70">
            {(invoices ?? []).map((i) => <li key={i.id as string} className="flex justify-between gap-2 px-4 py-3 text-sm"><span>{i.kind === "gst" ? "GST invoice" : "Final invoice"} {i.number as string}</span><span>{rupees(Number(i.total_paise))}{Number(i.balance_paise) > 0 ? ` · ${rupees(Number(i.balance_paise))} due` : ""}</span></li>)}
          </ul>
        </Card>
      ) : null}
      <p className="text-xs text-ink-soft">10% holds your date; 40% within two weeks signs the contract and opens décor; the final 50% is due 30 days before your celebration. Receipts arrive on WhatsApp and here.</p>
    </PortalShell>
  );
}
