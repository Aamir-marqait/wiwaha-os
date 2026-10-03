import { describe, expect, it } from "vitest";
import { decide, seedWedding, testWorld } from "../../framework/testing";
import { buildLines, onQuoteDecided, prepareQuote, totals } from "./agent";

function ready(w: ReturnType<typeof testWorld>, weddingKind: "standard" | "custom") {
  w.db.rows("menus").push(
    { id: "m1", wedding_id: "wd1", function_id: "fn-haldi", cuisine: "South Indian", outside_caterer: false, per_plate_paise: 1_200_00, plate_count: 120, status: "client_approved" },
    { id: "m2", wedding_id: "wd1", function_id: "fn-wed", cuisine: "South Indian", outside_caterer: false, per_plate_paise: 1_500_00, plate_count: 350, status: "chef_confirmed" },
  );
  w.db.rows("moodboards").push(
    { id: "mb1", wedding_id: "wd1", function_id: "fn-haldi", theme: "Marigold courtyard", design_kind: "standard", status: "finalised" },
    { id: "mb2", wedding_id: "wd1", function_id: "fn-wed", theme: "Royal Rajasthani", design_kind: weddingKind, status: weddingKind === "custom" ? "approved" : "finalised" },
  );
}

describe("Quote", () => {
  it("prices every line from the price book with GST per category", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    ready(w, "standard");
    const { lines, offBook } = await buildLines(w.db, "wd1");
    expect(offBook).toBe(0);
    expect(lines.find((l) => /Estate exclusive use \(2 days\)/.test(l.description))).toMatchObject({ quantity: 2, unit_price_paise: 450_000_00 });
    expect(lines.find((l) => /Haldi: South Indian menu/.test(l.description))).toMatchObject({ quantity: 120, gst_rate_bps: 500, line_total_paise: 120 * 1_200_00 });
    const t = totals(lines);
    expect(t.total).toBe(t.subtotal + t.tax);
  });

  it("a custom décor line is off-book and waits for Prashanth; nothing reaches the couple", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    ready(w, "custom");
    const out = await prepareQuote(w.deps, "wd1");
    if (out.status !== "done") throw new Error(out.status);
    const a = w.store.approvals[0]!;
    expect(a).toMatchObject({ kind: "quote", priority: 1, guardrailFlags: ["off_book"] });
    expect(w.db.rows("quotes")[0]).toMatchObject({ status: "pending_approval" });
    expect(w.db.rows("quote_lines").filter((l) => l.off_book)).toHaveLength(1);
    expect(w.db.rows("outbox")).toHaveLength(0);
  });

  it("once approved (after re-pricing), totals are recomputed and the couple is told", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    ready(w, "custom");
    const out = await prepareQuote(w.deps, "wd1");
    if (out.status !== "done") throw new Error(out.status);
    const custom = w.db.rows("quote_lines").find((l) => l.off_book)!;
    custom.unit_price_paise = 500_000_00;
    custom.line_total_paise = 500_000_00;
    decide(w, out.result.approvalId);
    await onQuoteDecided(w.deps, out.result.approvalId, "approved");
    const q = w.db.rows("quotes")[0]!;
    expect(q.status).toBe("sent");
    expect(Number(q.total_paise)).toBeGreaterThan(out.result.totalPaise);
    expect(w.db.rows("outbox").find((o) => o.to_address === "+919900000101")).toBeTruthy();
    expect(w.store.messages.at(-1)!.body).not.toMatch(/₹|discount/i);
  });
});
