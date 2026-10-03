import { describe, expect, it } from "vitest";
import { STAFF, testWorld } from "../../framework/testing";
import { escalateOverdue, eveningReview, morningStandup } from "./agent";

const at = (iso: string) => testWorld({ now: new Date(iso) });
function tasks(w: ReturnType<typeof testWorld>) {
  w.db.rows("tasks").push(
    { id: "k1", title: "Pool cleaning", owner_id: STAFF.staff.id, owner_role: "staff", due_at: "2026-10-03T06:30:00Z", priority: "normal", status: "todo", wedding_id: null, buffer_hours: 4, escalated_at: null, escalated_owner_at: null },
    { id: "k2", title: "Generator serviced", owner_id: null, owner_role: "staff", due_at: "2026-10-01T04:30:00Z", priority: "urgent", status: "todo", wedding_id: null, buffer_hours: 12, escalated_at: null, escalated_owner_at: null },
    { id: "k3", title: "Kick-off call", owner_id: STAFF.em.id, owner_role: "event_manager", due_at: "2026-10-03T08:30:00Z", priority: "high", status: "done", completed_at: "2026-10-03T07:00:00Z", completed_by: STAFF.em.id, wedding_id: null, buffer_hours: 24 },
  );
}

describe("Stand-up", () => {
  it("waits for 8:30 am IST, then briefs each person on WhatsApp once", async () => {
    const early = at("2026-10-03T02:30:00Z"); // 8:00 am IST
    tasks(early);
    const e = await morningStandup(early.deps);
    expect(e.status === "done" && e.result.sent).toBe(0);

    const w = at("2026-10-03T03:05:00Z"); // 8:35 am IST
    tasks(w);
    const a = await morningStandup(w.deps);
    const b = await morningStandup(w.deps);
    expect(a.status === "done" && a.result.sent).toBe(2); // estate staff + Prashanth's summary
    expect(b.status === "done" && b.result.sent).toBe(0);
    const brief = w.db.rows("briefs").find((r) => r.recipient_id === STAFF.staff.id)!;
    expect(String(brief.content_md)).toMatch(/Pool cleaning/);
    expect(String(brief.content_md)).toMatch(/Overdue \(1\):\n• Generator serviced/);
    expect(String(w.db.rows("briefs").find((r) => r.recipient_id === STAFF.owner.id)!.content_md)).toMatch(/approvals waiting/);
    expect(w.db.rows("outbox").some((o) => o.to_address === STAFF.staff.phone_e164)).toBe(true);
  });

  it("evening review lists closed and slipped work after 7 pm", async () => {
    const w = at("2026-10-03T13:35:00Z"); // 7:05 pm IST
    tasks(w);
    const out = await eveningReview(w.deps);
    expect(out.status === "done" && out.result.sent).toBeGreaterThanOrEqual(2);
    expect(String(w.db.rows("briefs").find((r) => r.recipient_id === STAFF.em.id)!.content_md)).toMatch(/Closed today: 1/);
    expect(String(w.db.rows("briefs").find((r) => r.recipient_id === STAFF.staff.id)!.content_md)).toMatch(/Slipped \(2\)/);
  });

  it("escalates overdue work to the event manager, then to Prashanth", async () => {
    const w = at("2026-10-03T04:30:00Z");
    tasks(w);
    const first = await escalateOverdue(w.deps);
    expect(first.status === "done" && first.result).toEqual({ toManager: 1, toOwner: 0 }); // k2 is past its 12h buffer; k1 isn't due yet
    expect(w.db.rows("tasks").find((t) => t.id === "k2")).toMatchObject({ escalated_to: "event_manager" });
    const later = at("2026-10-05T04:30:00Z");
    later.db.rows("tasks").push({ ...w.db.rows("tasks").find((t) => t.id === "k2")! });
    const second = await escalateOverdue(later.deps);
    expect(second.status === "done" && second.result.toOwner).toBe(1);
    expect(later.db.rows("outbox").some((o) => o.to_address === STAFF.owner.phone_e164)).toBe(true);
  });
});
