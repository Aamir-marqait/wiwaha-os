import { exportInvoices } from "@wiwaha/agents";
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** CSV of the month's issued invoices for Tally or Zoho Books (owner and accounts; RLS applies). */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || !["owner", "accounts"].includes(viewer.profile.role)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const month = /^\d{4}-\d{2}$/.test(req.nextUrl.searchParams.get("month") ?? "") ? req.nextUrl.searchParams.get("month")! : new Date().toISOString().slice(0, 7);
  const format = req.nextUrl.searchParams.get("format") === "zoho_csv" ? "zoho_csv" : "tally_csv";
  const supabase = await createClient();
  const [y, m] = month.split("-").map(Number);
  const next = `${m === 12 ? y! + 1 : y}-${String(m === 12 ? 1 : m! + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase.from("invoices").select("number, issued_on, kind, subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise, wedding:weddings(title, code)").in("status", ["issued", "paid"]).gte("issued_on", `${month}-01`).lt("issued_on", next).order("issued_on");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []).map((i) => {
    const w = (Array.isArray(i.wedding) ? i.wedding[0] : i.wedding) as { title: string; code: string } | null;
    return { number: i.number as string, issued_on: i.issued_on as string, kind: i.kind as string, party: w?.title ?? "Client", subtotal_paise: Number(i.subtotal_paise), cgst_paise: Number(i.cgst_paise), sgst_paise: Number(i.sgst_paise), igst_paise: Number(i.igst_paise), total_paise: Number(i.total_paise), narration: `${w?.code ?? ""} ${i.kind} invoice`.trim() };
  });
  return new NextResponse(exportInvoices(rows, format), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wiwaha-invoices-${month}-${format === "tally_csv" ? "tally" : "zoho"}.csv"` } });
}
