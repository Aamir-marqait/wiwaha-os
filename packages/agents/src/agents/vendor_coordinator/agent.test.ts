import { describe, expect, it } from "vitest";
import { seedWedding, testWorld } from "../../framework/testing";
import { chaseVendors, lockVendors, onVendorReplied, onWorkOrderApproved } from "./agent";

function vendors(w: ReturnType<typeof testWorld>) {
  const v = (id: string, category: string, extra: Record<string, unknown> = {}) => ({ id, name: id, category, email: `${id}@vendors.test`, contact_name: null, preferred: true, designated_planner: false, active: true, rating: 4, ...extra });
  w.db.rows("vendors").push(
    v("photo-a", "photography", { rating: 5 }), v("photo-b", "photography", { rating: 3 }),
    v("decor-outside", "decor", { rating: 5 }), v("decor-planner", "decor", { designated_planner: true, rating: 4 }),
    v("dj-a", "music"),
  );
}

describe("Vendor Coordinator", () => {
  it("drafts one preferred vendor per category (décor only via a designated planner); nothing goes out until we approve", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    vendors(w);
    const out = await lockVendors(w.deps, "wd1");
    expect(out.status === "done" && out.result.requested).toBe(3);
    const asked = w.db.rows("vendor_bookings").map((b) => b.vendor_id).sort();
    expect(asked).toEqual(["decor-planner", "dj-a", "photo-a"]);
    // Work orders are only drafted: no email, no approval request an agent could auto-send.
    expect(w.store.messages).toHaveLength(0);
    expect(w.db.rows("vendor_bookings").every((b) => !b.work_order_approved_at)).toBe(true);
    expect(w.store.notifications.some((n) => /work orders? to approve/.test(n.title))).toBe(true);
    // Idempotent.
    const again = await lockVendors(w.deps, "wd1");
    expect(again.status === "done" && again.result.requested).toBe(0);
  });

  it("sends each vendor its work order from the approved quote, and turns an accepted one into checklist tasks", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    vendors(w);
    w.db.rows("quotes").push({ id: "q1", wedding_id: "wd1", version: 1, status: "client_approved" });
    w.db.rows("quote_lines").push(
      { id: "l1", quote_id: "q1", description: "Haldi décor: Marigold arch", quantity: 1, function_id: "fn-haldi", category: "decor", sort: 10 },
      { id: "l2", quote_id: "q1", description: "Wedding: DJ Rhythm", quantity: 1, function_id: "fn-wed", category: "entertainment:dj", sort: 20 },
      { id: "l3", quote_id: "q1", description: "Estate exclusive use", quantity: 2, function_id: null, category: "venue", sort: 30 },
    );
    w.db.rows("quote_line_costs").push({ id: "l1", unit_cost_paise: 60_000_00 }, { id: "l2", unit_cost_paise: 30_000_00 });
    await lockVendors(w.deps, "wd1");
    const decor = w.db.rows("vendor_bookings").find((b) => b.vendor_id === "decor-planner")!;
    expect(decor.work_order).toEqual([{ description: "Haldi décor: Marigold arch", quantity: 1, function_id: "fn-haldi", function_name: "Haldi", date: "2027-02-12", unit_cost_paise: 60_000_00 }]);
    expect(decor.amount_paise).toBe(60_000_00);
    expect(w.db.rows("vendor_bookings").find((b) => b.vendor_id === "dj-a")!.work_order).toHaveLength(1);
    // Not sent until approved by us.
    expect((await onWorkOrderApproved(w.deps, decor.id as string)).status === "done").toBe(true);
    expect(w.store.messages).toHaveLength(0);
    decor.work_order_approved_at = w.now.toISOString();
    const sent = await onWorkOrderApproved(w.deps, decor.id as string);
    expect(sent.status === "done" && sent.result.sent).toBe(true);
    const mail = w.store.messages.find((m) => /Marigold arch/.test(m.body))!;
    expect(mail).toMatchObject({ status: "approved", channel: "email", clientVisible: false });
    expect(mail.body).toMatch(/Work order:/);
    expect(mail.body).toMatch(/\/vendor\/reply\//);
    // No client prices go to a vendor.
    expect(w.store.messages.every((m) => !/₹/.test(m.body))).toBe(true);

    decor.status = "confirmed";
    await onVendorReplied(w.deps, decor.id as string);
    const tasks = w.db.rows("tasks").filter((t) => String(t.title).startsWith("Check with decor-planner"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ owner_role: "event_manager", wedding_id: "wd1", proof_kind: "tick" });
    // Safe to repeat.
    await onVendorReplied(w.deps, decor.id as string);
    expect(w.db.rows("tasks").filter((t) => String(t.title).startsWith("Check with decor-planner"))).toHaveLength(1);
  });

  it("chases after the policy wait, then hands to the event manager", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    vendors(w);
    w.db.rows("vendor_bookings").push({ id: "vb1", vendor_id: "dj-a", wedding_id: "wd1", status: "requested", reply_token: "tok", chase_count: 0, last_chased_at: null, requested_at: new Date(w.now.getTime() - 49 * 3600_000).toISOString(), work_order_approved_at: new Date(w.now.getTime() - 49 * 3600_000).toISOString(), replied_at: null });
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
