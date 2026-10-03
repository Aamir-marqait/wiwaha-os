import { describe, expect, it } from "vitest";
import { seedWedding, testWorld } from "../../framework/testing";
import { chaseVendors, lockVendors, onVendorReplied } from "./agent";

function vendors(w: ReturnType<typeof testWorld>) {
  const v = (id: string, category: string, extra: Record<string, unknown> = {}) => ({ id, name: id, category, email: `${id}@vendors.test`, contact_name: null, preferred: true, designated_planner: false, active: true, rating: 4, ...extra });
  w.db.rows("vendors").push(
    v("photo-a", "photography", { rating: 5 }), v("photo-b", "photography", { rating: 3 }),
    v("decor-outside", "decor", { rating: 5 }), v("decor-planner", "decor", { designated_planner: true, rating: 4 }),
    v("dj-a", "music"),
  );
}

describe("Vendor Coordinator", () => {
  it("asks one preferred vendor per category (décor only via a designated planner), through approval", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    vendors(w);
    const out = await lockVendors(w.deps, "wd1");
    expect(out.status === "done" && out.result.requested).toBe(3);
    const asked = w.db.rows("vendor_bookings").map((b) => b.vendor_id).sort();
    expect(asked).toEqual(["decor-planner", "dj-a", "photo-a"]);
    expect(w.store.approvals.every((a) => a.kind === "vendor_message")).toBe(true);
    expect(w.store.messages.every((m) => m.clientVisible === false && /\/vendor\/reply\//.test(m.body))).toBe(true);
    // Idempotent.
    const again = await lockVendors(w.deps, "wd1");
    expect(again.status === "done" && again.result.requested).toBe(0);
  });

  it("chases after the policy wait, then hands to the event manager", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    vendors(w);
    w.db.rows("vendor_bookings").push({ id: "vb1", vendor_id: "dj-a", wedding_id: "wd1", status: "requested", reply_token: "tok", chase_count: 0, last_chased_at: null, requested_at: new Date(w.now.getTime() - 49 * 3600_000).toISOString(), replied_at: null });
    const first = await chaseVendors(w.deps);
    expect(first.status === "done" && first.result.chased).toBe(1);
    const soon = await chaseVendors(w.deps);
    expect(soon.status === "done" && soon.result.chased).toBe(0);
    const b = w.db.rows("vendor_bookings")[0]!;
    b.chase_count = 3;
    b.last_chased_at = new Date(w.now.getTime() - 49 * 3600_000).toISOString();
    const esc = await chaseVendors(w.deps);
    expect(esc.status === "done" && esc.result.escalated).toBe(1);
    expect(w.db.rows("outbox").some((o) => o.to_address === "+919800000003")).toBe(true);
  });

  it("a decline moves to the next vendor; all confirmed closes the stage", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    vendors(w);
    await lockVendors(w.deps, "wd1");
    const photo = w.db.rows("vendor_bookings").find((b) => b.vendor_id === "photo-a")!;
    photo.status = "declined";
    await onVendorReplied(w.deps, String(photo.id));
    expect(w.db.rows("vendor_bookings").some((b) => b.vendor_id === "photo-b")).toBe(true);
    for (const b of w.db.rows("vendor_bookings")) if (b.status !== "declined") b.status = "confirmed";
    const out = await onVendorReplied(w.deps, String(photo.id));
    expect(out.status === "done" && out.result.allConfirmed).toBe(true);
    expect(w.db.rows("wedding_stages").find((s) => s.key === "vendors")).toMatchObject({ status: "done" });
  });
});
