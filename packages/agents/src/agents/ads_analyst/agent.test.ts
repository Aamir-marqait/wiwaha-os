import { describe, expect, it } from "vitest";
import { testWorld } from "../../framework/testing";
import { analyse, recommend, weeklyAdsReport } from "./agent";

describe("Ads Analyst", () => {
  it("works out cost per enquiry and per booking by platform", () => {
    const rows = analyse(
      [{ platform: "meta", spend_paise: 60_000_00 }, { platform: "google", spend_paise: 40_000_00 }],
      [{ id: "l1", source: "instagram" }, { id: "l2", source: "meta_form" }, { id: "l3", source: "facebook" }, { id: "l4", source: "google_ads" }],
      new Set(["l2"]), ["meta", "google"],
    );
    expect(rows[0]).toMatchObject({ platform: "meta", enquiries: 3, bookings: 1, cpePaise: 20_000_00, cpbPaise: 60_000_00 });
    expect(rows[1]).toMatchObject({ platform: "google", enquiries: 1, bookings: 0, cpbPaise: null });
    expect(recommend(rows)).toMatch(/move about 15% of next week's google budget to meta/);
    expect(recommend([])).toMatch(/No ad spend/);
  });

  it("reports on Mondays only, once, as a recommendation for Prashanth", async () => {
    const sat = testWorld();
    const s = await weeklyAdsReport(sat.deps);
    expect(s.status === "done" && s.result.approvalId).toBe(null);

    const w = testWorld({ now: new Date("2026-10-05T04:30:00Z") }); // Monday
    w.db.rows("ad_spend").push({ platform: "meta", day: "2026-10-01", spend_paise: 30_000_00 }, { platform: "google", day: "2026-10-02", spend_paise: 20_000_00 });
    w.db.rows("leads").push(...["instagram", "instagram", "meta_form", "google_ads"].map((source, i) => ({ id: `l${i}`, source, first_touch_at: "2026-10-02T06:00:00Z" })));
    const out = await weeklyAdsReport(w.deps);
    expect(out.status === "done" && out.result.approvalId).toBeTruthy();
    expect(w.store.approvals[0]).toMatchObject({ kind: "ad_budget" });
    expect(String((w.store.approvals[0]!.payload as { body: string }).body)).toMatch(/budgets are changed by hand/);
    const again = await weeklyAdsReport(w.deps);
    expect(again.status === "done" && again.result.approvalId).toBe(null);
  });
});
