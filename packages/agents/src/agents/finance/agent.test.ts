import { describe, expect, it } from "vitest";
import { exportInvoices, invoiceTotals, priceLine } from "../../domain/finance";
import { decide, seedWedding, testWorld } from "../../framework/testing";
import { closeOutWedding, onDepositDecided, onInspectionDone, onInvoicesDecided, startCloseOuts } from "./agent";

function approvedQuote(w: ReturnType<typeof testWorld>) {
  w.db.rows("quotes").push({ id: "q1", wedding_id: "wd1", version: 2, status: "client_approved" });
  w.db.rows("quote_lines").push(
    { quote_id: "q1", description: "Estate exclusive use (2 days)", quantity: 2, unit_price_paise: 450_000_00, line_total_paise: 900_000_00, price_book_item_id: "pb-ven", sort: 10 },
    { quote_id: "q1", description: "Wedding: South Indian menu", quantity: 350, unit_price_paise: 1_500_00, line_total_paise: 525_000_00, price_book_item_id: "pb-nv", sort: 20 },
  );
}

describe("Finance", () => {
  it("GST comes from the policy book and splits into CGST + SGST in Karnataka", () => {
    const rates = { venue: 1800, catering: 500, services: 1800 };
    const lines = [priceLine({ description: "Venue", category: "venue", quantity: 1, unit_price_paise: 100_000 }, rates), priceLine({ description: "Food", category: "catering", quantity: 10, unit_price_paise: 1_000 }, rates)];
    expect(lines.map((l) => l.tax_paise)).toEqual([18_000, 500]);
    expect(invoiceTotals(lines, true)).toEqual({ subtotal: 110_000, cgst: 9_250, sgst: 9_250, igst: 0, total: 128_500 });
    expect(invoiceTotals(lines, false).igst).toBe(18_500);
    const csv = exportInvoices([{ number: "WIW/2027/0001", issued_on: "2027-02-16", kind: "final", party: "Ananya & Rohan", subtotal_paise: 110_000, cgst_paise: 9_250, sgst_paise: 9_250, igst_paise: 0, total_paise: 128_500, narration: "Wedding, Feb 2027" }], "tally_csv");
    expect(csv.split("\n")[1]).toBe("2027-02-16,Sales,WIW/2027/0001,Ananya & Rohan,Wedding services,1100.00,92.50,92.50,0.00,1285.00,\"Wedding, Feb 2027\"");
  });

  it("after the event: close-out starts, invoices and profit wait for approval, then go to the couple", async () => {
    const w = testWorld({ now: new Date("2027-02-15T04:30:00Z") });
    seedWedding(w, { paid: ["deposit", "contract", "final"] });
    approvedQuote(w);
    w.db.rows("cost_entries").push({ wedding_id: "wd1", category: "fnb", amount_paise: 300_000_00 }, { wedding_id: "wd1", category: "staff", amount_paise: 120_000_00 });
    const s = await startCloseOuts(w.deps);
    expect(s.status === "done" && s.result.started).toBe(1);
    expect(w.db.rows("agent_tasks").map((t) => t.kind).sort()).toEqual(["closeout_due", "offboarding_due"]);

    const out = await closeOutWedding(w.deps, "wd1");
    if (out.status !== "done" || !out.result.approvalId) throw new Error("expected approval");
    const [fin, gstInv] = w.db.rows("invoices");
    expect(fin).toMatchObject({ kind: "final", status: "pending_approval", subtotal_paise: 1_425_000_00 });
    // venue 18% of 9,00,000 + catering 5% of 5,25,000
    expect(Number(fin!.cgst_paise) + Number(fin!.sgst_paise)).toBe(162_000_00 + 26_250_00);
    expect(gstInv).toMatchObject({ kind: "gst" });
    expect(String(w.store.approvals[0]!.payload && (w.store.approvals[0]!.payload as { body: string }).body)).toMatch(/Profit: revenue \(ex GST\)/);
    expect(w.db.rows("outbox")).toHaveLength(0);

    decide(w, out.result.approvalId);
    await onInvoicesDecided(w.deps, out.result.approvalId, "approved");
    expect(w.db.rows("invoices").every((i) => i.status === "issued")).toBe(true);
    expect(w.db.rows("outbox").some((o) => o.to_address === "ananya@example.com")).toBe(true);
    // Idempotent: a second close-out doesn't issue new numbers.
    const again = await closeOutWedding(w.deps, "wd1");
    expect(again.status === "done" && again.result.invoices).toEqual([]);
  });

  it("proposes the security-deposit decision from the inspection, for Prashanth to decide", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract", "final"] });
    w.store.setPolicy("closeout.inspection", { photo_required: true, security_deposit_paise: 100_000_00, deposit_decision_role: "owner" });
    w.db.rows("inspections").push({ id: "ins1", wedding_id: "wd1", damage_total_paise: 15_000_00, items: [{ area: "Pavilion", ok: false, note: "Two chairs broken", damage_paise: 15_000_00 }], approval_id: null });
    const out = await onInspectionDone(w.deps, "wd1");
    if (out.status !== "done" || !out.result.approvalId) throw new Error("expected approval");
    expect(out.result.decision).toBe("refund_partial");
    decide(w, out.result.approvalId);
    await onDepositDecided(w.deps, out.result.approvalId, "approved");
    expect(w.db.rows("inspections")[0]).toMatchObject({ deposit_decision: "refund_partial", deposit_refund_paise: 85_000_00 });
  });
});
