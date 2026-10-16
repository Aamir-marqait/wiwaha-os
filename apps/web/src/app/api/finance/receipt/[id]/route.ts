import { formatDateIST } from "@wiwaha/db";
import { NextResponse, type NextRequest } from "next/server";
import { buildReceiptPdf, METHOD_LABELS } from "@/lib/finance/documents";
import { loadSeller } from "@/lib/finance/seller";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** A payment receipt (D42). Row-level security decides who may see it: our finance team, the event manager, and family members who can see payments. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient("public");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: p } = await supabase.from("payments").select("id, wedding_id, label, amount_paise, paid_amount_paise, status, paid_at, method, gateway_ref, receipt_number").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (p.status !== "paid" || !p.receipt_number) return NextResponse.json({ error: "No receipt until it's paid" }, { status: 409 });
  const [{ data: w }, { data: schedule }, seller] = await Promise.all([
    // Row-level security already let this person see the payment; the couple's name comes from contacts, which families can't read.
    createAdminClient("system").from("weddings").select("title, event_start, event_end, contact:contacts!primary_contact_id(full_name)").eq("id", p.wedding_id).maybeSingle(),
    supabase.from("payments").select("label, amount_paise, paid_amount_paise, status, due_on").eq("wedding_id", p.wedding_id).order("sort"),
    loadSeller(),
  ]);
  const contact = one(w?.contact as { full_name: string } | { full_name: string }[] | null);
  const dates = w ? `${formatDateIST(w.event_start as string, { day: "numeric", month: "short" })}${w.event_end && w.event_end !== w.event_start ? ` – ${formatDateIST(w.event_end as string, { day: "numeric", month: "short", year: "numeric" })}` : ""}` : "";
  const pdf = await buildReceiptPdf({
    seller, number: p.receipt_number as string, paidOn: formatDateIST((p.paid_at as string) ?? new Date().toISOString(), { day: "numeric", month: "short", year: "numeric" }),
    receivedFrom: contact?.full_name ?? (w?.title as string | undefined) ?? "", wedding: [w?.title, dates].filter(Boolean).join(" · "),
    forWhat: p.label as string, amountPaise: Number(p.paid_amount_paise ?? p.amount_paise), method: p.method ? METHOD_LABELS[p.method as string] ?? String(p.method) : null, reference: (p.gateway_ref as string | null) ?? null,
    schedule: (schedule ?? []).filter((s) => !["cancelled", "waived"].includes(s.status as string)).map((s) => ({ label: s.label as string, amountPaise: Number(s.status === "paid" ? s.paid_amount_paise ?? s.amount_paise : s.amount_paise), status: s.status === "paid" ? "Paid" : s.status === "overdue" ? "Overdue" : "Due", due: formatDateIST(s.due_on as string, { day: "numeric", month: "short", year: "numeric" }) })),
  });
  return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${p.receipt_number as string}.pdf"`, "cache-control": "private, no-store" } });
}
