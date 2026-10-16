import { writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildInvoicePdf, buildReceiptPdf, inr } from "./documents";

const OUT = process.env.SLIDE_TEST_DIR;
const seller = { name: "Wiwaha by Praman", legalName: "Praman Estates LLP", address: "Survey No. 12, Devanahalli, Bengaluru 562110", gstin: null, stateCode: "29", logo: null };

describe("receipts and invoices", () => {
  it("formats rupees the Indian way", () => {
    expect(inr(1_23_45_678_90)).toBe("₹1,23,45,678.90");
    expect(inr(50_000_00)).toBe("₹50,000.00");
    expect(inr(99)).toBe("₹0.99");
  });

  it("builds a one-page receipt with the method and schedule", async () => {
    const pdf = await buildReceiptPdf({
      seller, number: "RCPT-2026-00012", paidOn: "17 Oct 2026", receivedFrom: "Ananya Rao", wedding: "Ananya & Rohan · 13–15 Feb 2027",
      forWhat: "Advance (50%): holds the date and signs the contract", amountPaise: 10_00_000_00, method: "UPI", reference: "UTR 4521",
      schedule: [{ label: "Advance (50%)", amountPaise: 10_00_000_00, status: "Paid", due: "17 Oct 2026" }, { label: "Balance (50%)", amountPaise: 10_00_000_00, status: "Due", due: "14 Jan 2027" }],
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Receipt RCPT-2026-00012");
    if (OUT) await writeFile(`${OUT}/receipt.pdf`, pdf);
  });

  it("builds a GST invoice that runs onto a second page when long", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ description: `Line ${i + 1}: venue, décor and services for the wedding day, with a long description that wraps`, quantity: 1, unitPaise: 1_00_000_00, gstRateBps: 1800, taxablePaise: 1_00_000_00, taxPaise: 18_000_00 }));
    const pdf = await buildInvoicePdf({
      seller, title: "Tax invoice", number: "WIW-GST-0001", issuedOn: "16 Feb 2027", billTo: "Ananya Rao", wedding: "Ananya & Rohan · 13–15 Feb 2027", lines,
      subtotalPaise: 30_00_000_00, cgstPaise: 2_70_000_00, sgstPaise: 2_70_000_00, igstPaise: 0, totalPaise: 35_40_000_00, paidPaise: 20_00_000_00, balancePaise: 15_40_000_00,
      payments: [{ label: "Advance (50%)", paidOn: "17 Oct 2026", amountPaise: 10_00_000_00, method: "Cash", receipt: "RCPT-2026-00012" }],
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    if (OUT) await writeFile(`${OUT}/invoice.pdf`, pdf);
  });
});
