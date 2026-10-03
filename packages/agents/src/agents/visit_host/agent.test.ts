import { describe, expect, it } from "vitest";
import { ScriptedLlm } from "../../framework/llm";
import { STAFF, testWorld } from "../../framework/testing";
import { onVisitBooked, recapVisit, sendVisitReminders } from "./agent";

function seed(w: ReturnType<typeof testWorld>, scheduledAt: string) {
  w.db.rows("contacts").push({ id: "c1", full_name: "Priya Natarajan", phone_e164: "+919900011103", email: "priya@example.com" });
  w.db.rows("leads").push({ id: "l1", contact_id: "c1", status: "visit_booked", date_wanted: "2027-03-14", guest_count: 180, message: "Karthik and I would like to see the Pavilion for the sangeet. What's the price?", city: "Bengaluru", source: "website" });
  w.db.rows("visits").push({ id: "v1", lead_id: "l1", scheduled_at: scheduledAt, executive_id: STAFF.sales.id, attendees: "Priya, Karthik and both mothers", attendee_count: 4, status: "scheduled", reminder_sent_at: null });
}

describe("Visit Host", () => {
  it("briefs the executive on WhatsApp and drafts the family's confirmation for approval", async () => {
    const w = testWorld();
    w.store.setPolicy("visits.booking", { ...(w.store.policies.find((p) => p.key === "visits.booking")!.value as object), location_pin_url: "https://maps.app.goo.gl/wiwaha" });
    seed(w, "2026-10-05T05:30:00Z");
    const out = await onVisitBooked(w.deps, "v1");
    expect(out.status).toBe("done");
    const visit = w.db.rows("visits")[0]!;
    expect(String(visit.pre_visit_brief)).toMatch(/Priya, Karthik and both mothers/);
    expect(String(visit.pre_visit_brief)).toMatch(/Checklist: Executive in uniform/);
    // Internal brief goes straight to the executive's WhatsApp…
    expect(w.db.rows("outbox").find((o) => o.to_address === STAFF.sales.phone_e164)).toMatchObject({ kind: "whatsapp", status: "sandboxed" });
    // …the family's confirmation waits for approval (agent in draft).
    const approval = w.store.approvals[0]!;
    expect(approval.kind).toBe("visit_message");
    const msg = w.store.messages[0]!;
    expect(msg).toMatchObject({ status: "pending_approval", channel: "whatsapp", toAddress: "+919900011103" });
    expect(msg.body).toMatch(/Monday, 5 October/);
    expect(msg.body).toMatch(/maps\.app\.goo\.gl/);
    expect(msg.body).not.toMatch(/₹/);
  });

  it("sends nothing to the family without approval while in draft, even with a model", async () => {
    const w = testWorld({ llm: new ScriptedLlm(() => "Your visit is confirmed and we'll give you a 10% discount!") });
    seed(w, "2026-10-05T05:30:00Z");
    await onVisitBooked(w.deps, "v1");
    expect(w.store.messages[0]!.status).toBe("pending_approval");
    // The unsafe model draft was replaced by the safe template.
    expect(w.store.messages[0]!.body).not.toMatch(/discount/i);
    expect(w.db.rows("outbox").filter((o) => o.to_address === "+919900011103")).toHaveLength(0);
  });

  it("drafts one reminder the day before, and only once", async () => {
    const w = testWorld();
    seed(w, new Date(w.now.getTime() + 20 * 3600_000).toISOString());
    const first = await sendVisitReminders(w.deps);
    const second = await sendVisitReminders(w.deps);
    expect(first.status === "done" && first.result.drafted).toBe(1);
    expect(second.status === "done" && second.result.drafted).toBe(0);
  });

  it("turns the executive's voice note into a recap on the lead", async () => {
    const w = testWorld();
    seed(w, "2026-10-03T03:30:00Z");
    const out = await recapVisit(w.deps, "v1", "They loved the lawn, worried about parking for sixty cars, want to bring mothers again next Sunday.");
    expect(out.status).toBe("done");
    expect(w.db.rows("visits")[0]).toMatchObject({ status: "completed" });
    expect(String(w.db.rows("visits")[0]!.recap)).toMatch(/parking/);
    expect(w.db.rows("leads")[0]).toMatchObject({ status: "visited" });
    expect(w.store.messages.at(-1)).toMatchObject({ channel: "internal", direction: "internal" });
  });
});
