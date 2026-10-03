import { describe, expect, it } from "vitest";
import { decide, seedWedding, STAFF, testWorld } from "../../framework/testing";
import { buildRunOfShow, dueDateFor, generatePlan, onRunOfShowDecided } from "./agent";

function templates(w: ReturnType<typeof testWorld>) {
  const t = (id: string, t_minus_days: number, title: string, default_role: string, proof_kind = "tick") => ({ id, plan_key: "standard_wedding", scope: "wedding", t_minus_days, title, description: null, default_role, priority: "normal", proof_kind, buffer_hours: 24, sort: 100 - t_minus_days, active: true });
  w.db.rows("task_templates").push(t("t90", 90, "Kick-off call", "event_manager"), t("t30", 30, "Final payment received", "accounts"), t("t7", 7, "Generator serviced", "staff", "photo"), t("t0", 0, "Welcome desk running", "staff"), t("tp1", -1, "Handover inspection", "staff", "photo"));
}

describe("Planner", () => {
  it("dates T-minus steps from the first day and T+ steps from the last", () => {
    expect(dueDateFor(30, "2027-02-12", "2027-02-13")).toBe("2027-01-13");
    expect(dueDateFor(0, "2027-02-12", "2027-02-13")).toBe("2027-02-12");
    expect(dueDateFor(-1, "2027-02-12", "2027-02-13")).toBe("2027-02-14");
  });

  it("creates the full plan from the templates, each with a named owner and a date, once", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    templates(w);
    const out = await generatePlan(w.deps, "wd1");
    expect(out.status === "done" && out.result.created).toBe(5);
    const tasks = w.db.rows("tasks");
    expect(tasks.find((t) => t.title === "Kick-off call")).toMatchObject({ owner_id: STAFF.em.id, due_at: "2026-11-14T04:30:00.000Z" });
    expect(tasks.find((t) => t.title === "Final payment received")).toMatchObject({ owner_id: STAFF.accounts.id });
    expect(tasks.find((t) => t.title === "Handover inspection")).toMatchObject({ owner_id: STAFF.staff.id, proof_kind: "photo", due_at: "2027-02-14T04:30:00.000Z" });
    expect(tasks.every((t) => t.created_by_agent === "planner")).toBe(true);
    const again = await generatePlan(w.deps, "wd1");
    expect(again.status === "done" && again.result).toEqual({ created: 0, skipped: 5 });
  });

  it("drafts the run-of-show from templates and shares it only after approval", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    w.db.rows("run_of_show_templates").push(
      { function_type: "wedding", offset_minutes: -60, duration_minutes: 60, title: "Guests arrive", owner_label: "Event manager", vendor_category: null, sort: 10, active: true },
      { function_type: "wedding", offset_minutes: 0, duration_minutes: 120, title: "Muhurtham", owner_label: "Priest", vendor_category: null, sort: 20, active: true },
      { function_type: "wedding", offset_minutes: -30, duration_minutes: 30, title: "Photographer in place", owner_label: "Photographer", vendor_category: "photography", sort: 15, active: true },
    );
    w.db.rows("vendors").push({ id: "v-photo", name: "Golden Hour", category: "photography", email: "hello@golden.test" });
    w.db.rows("vendor_bookings").push({ id: "vb1", wedding_id: "wd1", vendor_id: "v-photo", status: "confirmed" });
    const out = await buildRunOfShow(w.deps, "wd1");
    if (out.status !== "done" || !out.result.approvalId) throw new Error("expected approval");
    const items = w.db.rows("run_of_show_items").filter((i) => i.function_id === "fn-wed");
    expect(items.map((i) => i.starts_at)).toEqual(["06:30", "07:00", "07:30"]);
    expect(items.find((i) => i.title === "Photographer in place")).toMatchObject({ vendor_id: "v-photo" });
    expect(w.db.rows("outbox")).toHaveLength(0); // nothing shared before approval
    decide(w, out.result.approvalId);
    const shared = await onRunOfShowDecided(w.deps, out.result.approvalId, "approved");
    expect(shared.status === "done" && shared.result.shared).toBe(1);
    expect(w.db.rows("outbox").some((o) => o.to_address === "hello@golden.test")).toBe(true);
  });
});
