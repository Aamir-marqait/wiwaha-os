import { formatDateIST } from "@wiwaha/db";
import { NextResponse, type NextRequest } from "next/server";
import { buildInvoicePdf, METHOD_LABELS } from "@/lib/finance/documents";
import { loadSeller } from "@/lib/finance/seller";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
interface Line { description: string; quantity: number; unit_price_paise: number; gst_rate_bps: number; taxable_paise: number; tax_paise: number }

/** A final or GST invoice (D42). The couple sees it once it's issued; owner and accounts see drafts too (row-level security). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient("public");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ data: w }, { data: pays }, seller] = await Promise.all([
    // Row-level security already let this person see the invoice; the couple's name comes from contacts, which families can't read.
    createAdminClient("system").from("weddings").select("title, event_start, event_end, contact:contacts!primary_contact_id(full_name)").eq("id", inv.wedding_id).maybeSingle(),
    supabase.from("payments").select("label, amount_paise, paid_amount_paise, paid_at, method, receipt_number").eq("wedding_id", inv.wedding_id).eq("status", "paid").order("paid_at"),
    loadSeller(),
  ]);
  const contact = one(w?.contact as { full_name: string } | { full_name: string }[] | null);
  const dates = w ? `${formatDateIST(w.event_start as string, { day: "numeric", month: "short" })}${w.event_end && w.event_end !== w.event_start ? ` – ${formatDateIST(w.event_end as string, { day: "numeric", month: "short", year: "numeric" })}` : ""}` : "";
  const draft = inv.status === "draft" || inv.status === "pending_approval";
  const pdf = await buildInvoicePdf({
    seller, title: `${draft ? "Draft " : ""}${inv.kind === "gst" ? "Tax invoice" : inv.kind === "credit_note" ? "Credit note" : "Invoice"}`, number: inv.number as string,
    issuedOn: formatDateIST(inv.issued_on as string, { day: "numeric", month: "short", year: "numeric" }), billTo: contact?.full_name ?? (w?.title as string | undefined) ?? "",
    wedding: [w?.title, dates].filter(Boolean).join(" · "),
    lines: ((inv.lines ?? []) as Line[]).map((l) => ({ description: l.description, quantity: l.quantity, unitPaise: l.unit_price_paise, gstRateBps: l.gst_rate_bps, taxablePaise: l.taxable_paise, taxPaise: l.tax_paise })),
    subtotalPaise: Number(inv.subtotal_paise), cgstPaise: Number(inv.cgst_paise), sgstPaise: Number(inv.sgst_paise), igstPaise: Number(inv.igst_paise), totalPaise: Number(inv.total_paise),
    paidPaise: Number(inv.amount_paid_paise), balancePaise: Number(inv.balance_paise),
    payments: (pays ?? []).map((x) => ({ label: x.label as string, paidOn: x.paid_at ? formatDateIST(x.paid_at as string, { day: "numeric", month: "short", year: "numeric" }) : "", amountPaise: Number(x.paid_amount_paise ?? x.amount_paise), method: x.method ? METHOD_LABELS[x.method as string] ?? String(x.method) : null, receipt: (x.receipt_number as string | null) ?? null })),
  });
  return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${inv.number as string}.pdf"`, "cache-control": "private, no-store" } });
}
