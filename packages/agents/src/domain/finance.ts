/**
 * Invoices: GST per category from the policy book, split CGST + SGST within
 * Karnataka (IGST otherwise), and exports for Tally or Zoho Books.
 */
export interface InvoiceLine { description: string; category: string; quantity: number; unit_price_paise: number; gst_rate_bps: number; taxable_paise: number; tax_paise: number }
export interface InvoiceTotals { subtotal: number; cgst: number; sgst: number; igst: number; total: number }

export function priceLine(l: { description: string; category: string; quantity: number; unit_price_paise: number; line_total_paise?: number }, ratesBps: Record<string, number>): InvoiceLine {
  const rate = ratesBps[l.category] ?? ratesBps.services ?? 1800;
  const taxable = l.line_total_paise ?? Math.round(l.quantity * l.unit_price_paise);
  return { description: l.description, category: l.category, quantity: l.quantity, unit_price_paise: l.unit_price_paise, gst_rate_bps: rate, taxable_paise: taxable, tax_paise: Math.round((taxable * rate) / 10000) };
}

export function invoiceTotals(lines: InvoiceLine[], intraState: boolean): InvoiceTotals {
  const subtotal = lines.reduce((s, l) => s + l.taxable_paise, 0);
  const tax = lines.reduce((s, l) => s + l.tax_paise, 0);
  const cgst = intraState ? Math.floor(tax / 2) : 0;
  const sgst = intraState ? tax - cgst : 0;
  return { subtotal, cgst, sgst, igst: intraState ? 0 : tax, total: subtotal + tax };
}

const money = (p: number) => (p / 100).toFixed(2);
const csv = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export interface ExportInvoice { number: string; issued_on: string; kind: string; party: string; subtotal_paise: number; cgst_paise: number; sgst_paise: number; igst_paise: number; total_paise: number; narration: string }

/** Sales vouchers for Tally (Accounting Vouchers import) or Zoho Books (invoices CSV). */
export function exportInvoices(rows: ExportInvoice[], format: "tally_csv" | "zoho_csv"): string {
  if (format === "zoho_csv") {
    const head = ["Invoice Number", "Invoice Date", "Customer Name", "Sub Total", "CGST", "SGST", "IGST", "Total", "Notes"];
    return [head.join(","), ...rows.map((r) => [r.number, r.issued_on, r.party, money(r.subtotal_paise), money(r.cgst_paise), money(r.sgst_paise), money(r.igst_paise), money(r.total_paise), r.narration].map(csv).join(","))].join("\n");
  }
  const head = ["Voucher Date", "Voucher Type", "Voucher Number", "Party Ledger", "Sales Ledger", "Taxable Value", "CGST", "SGST", "IGST", "Invoice Value", "Narration"];
  return [head.join(","), ...rows.map((r) => [r.issued_on, "Sales", r.number, r.party, "Wedding services", money(r.subtotal_paise), money(r.cgst_paise), money(r.sgst_paise), money(r.igst_paise), money(r.total_paise), r.narration].map(csv).join(","))].join("\n");
}
