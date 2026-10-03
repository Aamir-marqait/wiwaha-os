import { describe, expect, it } from "vitest";
import { decide, testWorld } from "../../framework/testing";
import { estateSweep, onPurchaseDecided } from "./agent";

describe("Estate", () => {
  it("raises due maintenance with photo proof, and rolls the schedule once done", async () => {
    const w = testWorld();
    w.db.rows("maintenance_schedules").push({ id: "m1", name: "Pool cleaning", category: "pool", frequency_days: 3, last_done_on: "2026-09-30", next_due_on: "2026-10-03", owner_id: null, active: true }, { id: "m2", name: "Pest control", category: "pest_control", frequency_days: 30, last_done_on: "2026-09-20", next_due_on: "2026-10-20", owner_id: null, active: true });
    const a = await estateSweep(w.deps);
    expect(a.status === "done" && a.result.tasks).toBe(1);
    const task = w.db.rows("tasks")[0]!;
    expect(task).toMatchObject({ maintenance_id: "m1", proof_kind: "photo", scope: "estate" });
    task.status = "done"; task.completed_at = "2026-10-03T06:00:00Z";
    const b = await estateSweep(w.deps);
    expect(b.status === "done" && b.result.rolled).toBe(1);
    expect(w.db.rows("maintenance_schedules").find((s) => s.id === "m1")).toMatchObject({ last_done_on: "2026-10-03", next_due_on: "2026-10-06" });
  });

  it("low stock: small purchases go straight to the team, big ones wait for Prashanth", async () => {
    const w = testWorld();
    w.db.rows("inventory_items").push(
      { id: "i1", name: "Bath towels", category: "linen", quantity: 95, unit: "pcs", reorder_level: 120, unit_cost_paise: 200_00 },
      { id: "i2", name: "Chiavari chairs", category: "furniture", quantity: 380, unit: "pcs", reorder_level: 400, unit_cost_paise: 2_500_00 },
      { id: "i3", name: "Plates", category: "crockery", quantity: 900, unit: "pcs", reorder_level: 700, unit_cost_paise: 150_00 },
    );
    const out = await estateSweep(w.deps);
    expect(out.status === "done" && out.result).toMatchObject({ lowStock: 2, approvals: 1 });
    const towels = w.db.rows("purchase_requests").find((p) => p.item === "Bath towels")!;
    const chairs = w.db.rows("purchase_requests").find((p) => p.item === "Chiavari chairs")!;
    expect(towels).toMatchObject({ status: "requested", amount_paise: 85 * 200_00 }); // ₹17,000: under the ₹25,000 limit
    expect(chairs).toMatchObject({ status: "pending_approval" });
    expect(w.store.approvals[0]).toMatchObject({ kind: "purchase" });
    decide(w, String(chairs.approval_id));
    await onPurchaseDecided(w.deps, String(chairs.approval_id), "approved");
    expect(w.db.rows("purchase_requests").find((p) => p.item === "Chiavari chairs")).toMatchObject({ status: "approved" });
    // Running again doesn't duplicate requests.
    const again = await estateSweep(w.deps);
    expect(again.status === "done" && again.result.lowStock).toBe(0);
  });
});
