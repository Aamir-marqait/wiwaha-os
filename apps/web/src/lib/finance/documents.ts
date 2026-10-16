import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { fontDir } from "../media/slide";

/**
 * Receipts and invoices as plain black-and-white A4 PDFs (D42), with the
 * logo from Content studio → Brand when there is one. Amounts are paise.
 */

export interface Seller { name: string; legalName: string | null; address: string | null; gstin: string | null; stateCode: string | null; logo: Buffer | null }
export interface ReceiptInput {
  seller: Seller;
  number: string;
  paidOn: string;            // already formatted for India
  receivedFrom: string;
  wedding: string;           // "Ananya & Rohan · 13–15 Feb 2027"
  forWhat: string;           // the payment part's label
  amountPaise: number;
  method: string | null;     // "UPI", "Cash"…
  reference: string | null;
  schedule: { label: string; amountPaise: number; status: string; due: string }[];
}
export interface InvoiceInput {
  seller: Seller;
  title: string;             // "Tax invoice" / "Invoice"
  number: string;
  issuedOn: string;
  billTo: string;
  wedding: string;
  lines: { description: string; quantity: number; unitPaise: number; gstRateBps: number; taxablePaise: number; taxPaise: number }[];
  subtotalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number;
  paidPaise: number; balancePaise: number;
  payments: { label: string; paidOn: string; amountPaise: number; method: string | null; receipt: string | null }[];
}

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const INK = rgb(0.1, 0.1, 0.1);
const SOFT = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.82, 0.82, 0.82);

export { METHOD_LABELS } from "./labels";

/** ₹ with Indian grouping and paise. */
export function inr(paise: number): string {
  const neg = paise < 0;
  const [r, p] = (Math.abs(paise) / 100).toFixed(2).split(".") as [string, string];
  const last3 = r.slice(-3), rest = r.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${neg ? "−" : ""}₹${grouped}.${p}`;
}

interface Kit { doc: PDFDocument; serif: PDFFont; sans: PDFFont; bold: PDFFont; logo: PDFImage | null }

async function kit(seller: Seller): Promise<Kit> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const dir = fontDir();
  const serif = await doc.embedFont(await readFile(path.join(dir, "CormorantGaramond-SemiBold.ttf")), { subset: false });
  const sans = await doc.embedFont(await readFile(path.join(dir, "Poppins-Medium.ttf")), { subset: true });
  const bold = await doc.embedFont(await readFile(path.join(dir, "Poppins-SemiBold.ttf")), { subset: true });
  let logo: PDFImage | null = null;
  if (seller.logo) {
    try { logo = await doc.embedPng(await sharp(seller.logo).resize({ height: 160, withoutEnlargement: true }).png().toBuffer()); } catch { logo = null; }
  }
  doc.setAuthor(seller.legalName ?? seller.name);
  return { doc, serif, sans, bold, logo };
}

function text(p: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color = INK) { p.drawText(s, { x, y, size, font, color }); }
function right(p: PDFPage, s: string, xRight: number, y: number, font: PDFFont, size: number, color = INK) { p.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color }); }
function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split(/\n/)) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Seller block top-left (logo or name), document title and number top-right. Returns the y below it. */
function header(p: PDFPage, k: Kit, seller: Seller, title: string, meta: [string, string][]): number {
  let y = A4.h - M;
  if (k.logo) {
    const h = 40, w = (k.logo.width / k.logo.height) * h;
    p.drawImage(k.logo, { x: M, y: y - h, width: Math.min(w, 200), height: h });
    y -= h + 10;
  } else {
    text(p, seller.name, M, y - 24, k.serif, 24);
    y -= 34;
  }
  const lines = [seller.legalName && seller.legalName !== seller.name ? seller.legalName : null, ...(seller.address ? seller.address.split(/\n|,\s*(?=\S)/).slice(0, 4) : []), seller.gstin ? `GSTIN ${seller.gstin}` : null].filter((x): x is string => !!x);
  for (const l of lines) { text(p, l, M, y - 10, k.sans, 8.5, SOFT); y -= 12; }
  let ry = A4.h - M - 22;
  right(p, title.toUpperCase(), A4.w - M, ry, k.serif, 22);
  ry -= 20;
  for (const [a, b] of meta) { right(p, `${a}  ${b}`, A4.w - M, ry, k.sans, 9, SOFT); ry -= 13; }
  const bottom = Math.min(y, ry) - 16;
  p.drawLine({ start: { x: M, y: bottom }, end: { x: A4.w - M, y: bottom }, thickness: 0.8, color: INK });
  return bottom - 22;
}

function footer(p: PDFPage, k: Kit, note: string) {
  p.drawLine({ start: { x: M, y: 70 }, end: { x: A4.w - M, y: 70 }, thickness: 0.5, color: RULE });
  wrap(note, k.sans, 8, A4.w - 2 * M).slice(0, 3).forEach((l, i) => text(p, l, M, 56 - i * 11, k.sans, 8, SOFT));
}

export async function buildReceiptPdf(r: ReceiptInput): Promise<Uint8Array> {
  const k = await kit(r.seller);
  k.doc.setTitle(`Receipt ${r.number}`);
  const p = k.doc.addPage([A4.w, A4.h]);
  let y = header(p, k, r.seller, "Receipt", [["No.", r.number], ["Date", r.paidOn]]);
  text(p, "Received with thanks from", M, y, k.sans, 9, SOFT);
  text(p, r.receivedFrom, M, y - 16, k.bold, 13);
  text(p, r.wedding, M, y - 32, k.sans, 10, SOFT);
  y -= 70;
  p.drawRectangle({ x: M, y: y - 64, width: A4.w - 2 * M, height: 76, borderColor: INK, borderWidth: 0.8 });
  text(p, r.forWhat, M + 14, y - 8, k.sans, 10.5);
  text(p, [r.method ? `Paid by ${r.method}` : null, r.reference ? `Ref. ${r.reference}` : null].filter(Boolean).join("  ·  ") || " ", M + 14, y - 26, k.sans, 9, SOFT);
  right(p, inr(r.amountPaise), A4.w - M - 14, y - 40, k.bold, 20);
  y -= 110;
  if (r.schedule.length) {
    text(p, "Payment schedule", M, y, k.bold, 10);
    y -= 18;
    const paid = r.schedule.filter((s) => s.status === "Paid").reduce((s, x) => s + x.amountPaise, 0);
    const total = r.schedule.reduce((s, x) => s + x.amountPaise, 0);
    for (const s of r.schedule) {
      text(p, s.label, M, y, k.sans, 9.5);
      text(p, s.due, M + 300, y, k.sans, 9, SOFT);
      right(p, s.status, A4.w - M - 110, y, k.sans, 9, SOFT);
      right(p, inr(s.amountPaise), A4.w - M, y, k.sans, 9.5);
      y -= 16;
    }
    p.drawLine({ start: { x: M, y: y + 6 }, end: { x: A4.w - M, y: y + 6 }, thickness: 0.5, color: RULE });
    y -= 8;
    text(p, "Received so far", M, y, k.sans, 9.5); right(p, inr(paid), A4.w - M, y, k.bold, 9.5); y -= 15;
    text(p, "Balance", M, y, k.sans, 9.5); right(p, inr(total - paid), A4.w - M, y, k.bold, 9.5);
  }
  footer(p, k, "This receipt confirms payment received. It is not a tax invoice; the GST invoice is issued with the final invoice.");
  return k.doc.save();
}

export async function buildInvoicePdf(v: InvoiceInput): Promise<Uint8Array> {
  const k = await kit(v.seller);
  k.doc.setTitle(`${v.title} ${v.number}`);
  let p = k.doc.addPage([A4.w, A4.h]);
  let y = header(p, k, v.seller, v.title, [["No.", v.number], ["Date", v.issuedOn], ...(v.seller.stateCode ? [["Place of supply", v.seller.stateCode] as [string, string]] : [])]);
  text(p, "Bill to", M, y, k.sans, 9, SOFT);
  text(p, v.billTo, M, y - 16, k.bold, 12);
  text(p, v.wedding, M, y - 31, k.sans, 9.5, SOFT);
  y -= 60;
  const cols = { desc: M, qty: 330, rate: 395, gst: 455, amt: A4.w - M };
  const head = (yy: number) => {
    text(p, "Description", cols.desc, yy, k.bold, 8.5); right(p, "Qty", cols.qty + 20, yy, k.bold, 8.5); right(p, "Rate", cols.rate + 40, yy, k.bold, 8.5); right(p, "GST", cols.gst + 25, yy, k.bold, 8.5); right(p, "Taxable", cols.amt, yy, k.bold, 8.5);
    p.drawLine({ start: { x: M, y: yy - 6 }, end: { x: A4.w - M, y: yy - 6 }, thickness: 0.5, color: INK });
  };
  head(y);
  y -= 22;
  for (const l of v.lines) {
    const desc = wrap(l.description, k.sans, 9, cols.qty - cols.desc - 30);
    if (y - desc.length * 12 < 200) { p = k.doc.addPage([A4.w, A4.h]); y = A4.h - M - 10; head(y); y -= 22; }
    desc.forEach((d, i) => text(p, d, cols.desc, y - i * 12, k.sans, 9));
    right(p, String(l.quantity), cols.qty + 20, y, k.sans, 9);
    right(p, inr(l.unitPaise), cols.rate + 40, y, k.sans, 9);
    right(p, `${(l.gstRateBps / 100).toFixed(0)}%`, cols.gst + 25, y, k.sans, 9);
    right(p, inr(l.taxablePaise), cols.amt, y, k.sans, 9);
    y -= Math.max(1, desc.length) * 12 + 6;
  }
  p.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4.w - M, y: y + 4 }, thickness: 0.5, color: RULE });
  y -= 12;
  const row = (a: string, b: number, strong = false) => { text(p, a, 330, y, strong ? k.bold : k.sans, strong ? 10.5 : 9.5); right(p, inr(b), A4.w - M, y, strong ? k.bold : k.sans, strong ? 10.5 : 9.5); y -= strong ? 18 : 15; };
  row("Taxable value", v.subtotalPaise);
  if (v.igstPaise) row("IGST", v.igstPaise); else { row("CGST", v.cgstPaise); row("SGST", v.sgstPaise); }
  row("Total", v.totalPaise, true);
  row("Received", v.paidPaise);
  row("Balance due", v.balancePaise, true);
  if (v.payments.length) {
    y -= 10;
    if (y < 160) { p = k.doc.addPage([A4.w, A4.h]); y = A4.h - M - 10; }
    text(p, "Payments received", M, y, k.bold, 10);
    y -= 16;
    for (const x of v.payments) {
      text(p, x.label, M, y, k.sans, 9);
      text(p, [x.paidOn, x.method, x.receipt].filter(Boolean).join(" · "), M + 230, y, k.sans, 8.5, SOFT);
      right(p, inr(x.amountPaise), A4.w - M, y, k.sans, 9);
      y -= 14;
    }
  }
  footer(p, k, `${v.seller.gstin ? "" : "GSTIN to be added in the policy book (Finance → GST and invoices). "}Thank you for celebrating with us.`);
  return k.doc.save();
}
