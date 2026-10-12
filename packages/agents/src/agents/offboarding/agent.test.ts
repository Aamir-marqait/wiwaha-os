import { describe, expect, it } from "vitest";
import { seedWedding, testWorld } from "../../framework/testing";
import { anniversaryWishes, scheduleOffboarding, sendEveningReviewForms, sendOffboardingSteps } from "./agent";

describe("Offboarding", () => {
  it("schedules the farewell steps from the policy and sends them in order on the right days", async () => {
    const day = (d: string) => new Date(`${d}T04:30:00Z`);
    const w = testWorld({ now: day("2027-02-14") });
    seedWedding(w, { paid: ["deposit", "contract", "final"] });
    w.db.rows("contacts")[0]!.consent_email = true;
    const s = await scheduleOffboarding(w.deps, "wd1");
    expect(s.status === "done" && s.result.scheduled).toBe(6);
    const steps = () => w.db.rows("offboarding_steps");
    expect(steps().find((x) => x.key === "thank_you")!.due_on).toBe("2027-02-16");
    expect(steps().find((x) => x.key === "referral_ask")!.due_on).toBe("2027-02-27");
    w.db.rows("reviews")[0]!.form_token = "a".repeat(36);

    // Nothing before T+3.
    const early = await sendOffboardingSteps(w.deps);
    expect(early.status === "done" && early.result.drafted).toBe(0);

    // T+3 (16 Feb): thank-you and the review form (if not already sent that evening). The portal has
    // closed (policy portal.access), so the photo link becomes a task for the event manager.
    const t3 = testWorld({ now: day("2027-02-16") });
    for (const t of ["contacts", "weddings", "offboarding_steps", "reviews", "wedding_contacts"]) t3.db.rows(t).push(...w.db.rows(t).map((r) => ({ ...r })));
    const a = await sendOffboardingSteps(t3.deps);
    expect(a.status === "done" && a.result).toEqual({ drafted: 2, tasks: 1 });
    expect(t3.store.messages.map((m) => m.subject)).toEqual(["Thank you", "Ananya, how was your celebration?"]);
    expect(t3.db.rows("tasks")[0]!.title).toMatch(/Share the photo link/);
    expect(t3.store.messages[1]).toMatchObject({ channel: "email", toAddress: "ananya@example.com" });
    expect(t3.store.messages[1]!.body).toMatch(/\/review\/a{36}/);
    expect(t3.store.messages.every((m) => m.status === "pending_approval")).toBe(true);
    const b = await sendOffboardingSteps(t3.deps);
    expect(b.status === "done" && b.result.drafted).toBe(0); // once each

    // T+5: gift (task for the event manager) and newsletter (consented).
    const t5 = testWorld({ now: day("2027-02-18") });
    for (const t of ["contacts", "weddings", "offboarding_steps", "reviews"]) t5.db.rows(t).push(...t3.db.rows(t).map((r) => ({ ...r })));
    const c = await sendOffboardingSteps(t5.deps);
    expect(c.status === "done" && c.result).toEqual({ drafted: 2, tasks: 1 });
    expect(t5.db.rows("tasks")[0]!.title).toMatch(/parting gift/);
    expect(t5.db.rows("contacts")[0]).toMatchObject({ newsletter_opt_in: true });
    expect(t5.store.messages.some((m) => /₹|discount/i.test(m.body))).toBe(false);
  });

  it("sends the review form on the evening of the last function, once, and not again at T+3", async () => {
    const at = (iso: string) => new Date(iso);
    const w = testWorld({ now: at("2027-02-13T12:00:00Z") }); // 5:30 pm IST on the last day
    seedWedding(w, { paid: ["deposit", "contract", "final"] });
    w.db.rows("reviews").push({ id: "r1", wedding_id: "wd1", contact_id: w.db.rows("weddings")[0]!.primary_contact_id, form_token: "b".repeat(36), form_sent_at: null });
    const early = await sendEveningReviewForms(w.deps);
    expect(early.status === "done" && early.result.drafted).toBe(0); // before 7 pm
    w.now.setTime(at("2027-02-13T14:00:00Z").getTime()); // 7:30 pm IST
    const evening = await sendEveningReviewForms(w.deps);
    expect(evening.status === "done" && evening.result.drafted).toBe(1);
    expect(w.store.messages[0]).toMatchObject({ channel: "email", status: "pending_approval" });
    expect(w.store.messages[0]!.body).toMatch(/\/review\/b{36}/);
    const again = await sendEveningReviewForms(w.deps);
    expect(again.status === "done" && again.result.drafted).toBe(0);
  });

  it("sends anniversary wishes once a year", async () => {
    const w = testWorld({ now: new Date("2028-02-12T04:30:00Z") });
    seedWedding(w, { paid: ["deposit", "contract", "final"] });
    const a = await anniversaryWishes(w.deps);
    const b = await anniversaryWishes(w.deps);
    expect(a.status === "done" && a.result.drafted).toBe(1);
    expect(b.status === "done" && b.result.drafted).toBe(0);
    expect(w.store.messages[0]!.body).toMatch(/Happy first anniversary/);
  });
});
