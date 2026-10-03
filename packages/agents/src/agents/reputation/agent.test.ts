import { describe, expect, it } from "vitest";
import { ScriptedLlm } from "../../framework/llm";
import { STAFF, testWorld } from "../../framework/testing";
import { onExternalReview, onReplyDecided, onReviewSubmitted } from "./agent";

describe("Reputation", () => {
  it("drafts a warm reply to a 5★ Google review for approval", async () => {
    const w = testWorld();
    w.db.rows("external_reviews").push({ id: "r1", platform: "google", author_name: "Neha Kapoor", rating: 5, body: "The lawn at sunset was magical!", reply_status: "none" });
    const out = await onExternalReview(w.deps, "r1");
    expect(out.status === "done" && out.result.low).toBe(false);
    expect(w.store.approvals[0]).toMatchObject({ kind: "review_reply", priority: 3 });
    expect(w.db.rows("external_reviews")[0]).toMatchObject({ reply_status: "drafted" });
    expect(String(w.db.rows("external_reviews")[0]!.reply_draft)).toMatch(/Dear Neha/);
  });

  it("a 2★ review reaches Prashanth straight away and the reply never offers compensation", async () => {
    const w = testWorld({ llm: new ScriptedLlm(() => "So sorry Ravi, we'll refund 20% and give you a special rate next time.") });
    w.db.rows("external_reviews").push({ id: "r2", platform: "wedmegood", author_name: "Ravi", rating: 2, body: "Parking was chaos.", reply_status: "none" });
    await onExternalReview(w.deps, "r2");
    expect(w.db.rows("outbox").some((o) => o.to_address === STAFF.owner.phone_e164 && o.kind === "whatsapp")).toBe(true);
    expect(w.store.humanQueue[0]).toMatchObject({ assignedRole: "owner" });
    expect(w.store.approvals[0]).toMatchObject({ priority: 1 });
    expect(String(w.db.rows("external_reviews")[0]!.reply_draft)).not.toMatch(/refund|special rate|%/);
  });

  it("our own form: a low score is escalated once; a happy couple is asked to share publicly", async () => {
    const w = testWorld();
    w.db.rows("weddings").push({ id: "w1", title: "Ananya & Rohan" });
    w.db.rows("contacts").push({ id: "c1", full_name: "Ananya Rao", phone_e164: "+919845000001", email: null });
    w.db.rows("reviews").push({ id: "rv1", wedding_id: "w1", contact_id: "c1", score: 2, testimonial: "Food was cold", publish_consent: false, escalated_at: null });
    w.db.rows("reviews").push({ id: "rv2", wedding_id: "w1", contact_id: "c1", score: 5, testimonial: "Perfect day", publish_consent: true, escalated_at: null });
    await onReviewSubmitted(w.deps, "rv1");
    await onReviewSubmitted(w.deps, "rv1");
    expect(w.store.humanQueue.filter((q) => q.title.includes("2/5"))).toHaveLength(1);
    const happy = await onReviewSubmitted(w.deps, "rv2");
    expect(happy.status === "done" && happy.result.testimonial).toBe(true);
    expect(w.store.messages.at(-1)).toMatchObject({ status: "pending_approval", toAddress: "+919845000001" });
  });

  it("an edited approval becomes the reply that gets posted", async () => {
    const w = testWorld();
    w.db.rows("external_reviews").push({ id: "r3", platform: "google", author_name: "A", rating: 5, body: "Great", reply_status: "drafted", approval_id: "ap1" });
    w.db.rows("approvals").push({ id: "ap1", payload: { body: "draft" }, edited_payload: { body: "Prashanth's own words" } });
    await onReplyDecided(w.deps, "ap1", "edited");
    expect(w.db.rows("external_reviews")[0]).toMatchObject({ reply_status: "approved", reply_draft: "Prashanth's own words" });
  });
});
