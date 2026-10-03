import { describe, expect, it } from "vitest";
import { ScriptedLlm } from "../../framework/llm";
import { seedWedding, testWorld } from "../../framework/testing";
import { classify, nudgeStages, onFamilyMessage } from "./agent";

function say(w: ReturnType<typeof testWorld>, body: string, channel: "whatsapp" | "portal" = "whatsapp") {
  const id = `msg-${w.db.rows("messages").length + 1}`;
  w.db.rows("messages").push({ id, wedding_id: "wd1", channel, direction: "inbound", status: "received", body, metadata: { from: "+919900000103", name: "Lalitha" }, author_user_id: null });
  return id;
}

describe("Wedding Room", () => {
  it("classifies family messages", () => {
    expect(classify("We've decided on the Pavilion for the sangeet")).toBe("decision");
    expect(classify("Can we get a discount on the rooms?")).toBe("discount");
    expect(classify("Can we start the décor moodboards now?")).toBe("decor_early");
    expect(classify("Thank you!")).toBe("thanks");
  });

  it("logs a decision in the Wedding Room", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    await onFamilyMessage(w.deps, say(w, "We've decided to go with the Pavilion for the sangeet"));
    expect(w.db.rows("wedding_decisions")[0]).toMatchObject({ wedding_id: "wd1", decided_by_name: "Lalitha", source: "whatsapp" });
    expect(w.store.messages[0]).toMatchObject({ status: "pending_approval", toAddress: "+919900000103" });
  });

  it("won't start décor before the 40% payment, and says when it opens", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    await onFamilyMessage(w.deps, say(w, "Can you send us décor moodboards now? We're excited!"));
    expect(w.store.messages[0]!.body).toMatch(/open once/i);
    expect(w.store.messages[0]!.body).toMatch(/40%/);
    expect(w.db.rows("moodboards")).toHaveLength(0);
  });

  it("never discusses discounts or new prices: escalates instead", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    const d = await onFamilyMessage(w.deps, say(w, "Can we get a discount if we pay everything now?"));
    expect(d.status === "done" && d.result.escalated).toBe(true);
    expect(w.store.humanQueue[0]).toMatchObject({ assignedRole: "owner" });
    expect(w.store.messages[0]!.body).not.toMatch(/₹|%|discount of/i);

    const p = await onFamilyMessage(w.deps, say(w, "How much does an extra function cost?"));
    expect(p.status === "done" && p.result.escalated).toBe(true);
    expect(w.store.messages[1]!.body).not.toMatch(/₹/);
  });

  it("answers routine questions from the couple's own record", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    await onFamilyMessage(w.deps, say(w, "When is the next payment due?", "portal"));
    expect(w.store.messages[0]!.body).toMatch(/Contract payment \(40%\)/i);
    expect(w.store.messages[0]!.channel).toBe("portal");
    await onFamilyMessage(w.deps, say(w, "What time is the haldi?"));
    expect(w.store.messages[1]!.body).toMatch(/Haldi on .* at 09:00/);
  });

  it("an unknown question is escalated, even if a model tries to make something up", async () => {
    const w = testWorld({ llm: new ScriptedLlm(() => "Sure, we'll give you free fireworks and a 20% discount!") });
    seedWedding(w, { paid: ["deposit"] });
    const out = await onFamilyMessage(w.deps, say(w, "Can my uncle bring his drone?"));
    expect(out.status === "done" && out.result.escalated).toBe(true);
    expect(w.store.messages[0]!.body).toMatch(/check that with Arjun/);
  });

  it("nudges once after the recommended date, then asks the event manager to call", async () => {
    const w = testWorld({ now: new Date("2026-11-20T04:30:00Z") });
    seedWedding(w, { paid: ["deposit"] });
    const a = await nudgeStages(w.deps);
    expect(a.status === "done" && a.result.nudged).toBe(3); // brief, menus, vendors (décor is locked)
    const b = await nudgeStages(w.deps);
    expect(b.status === "done" && b.result.nudged).toBe(0);
    const later = testWorld({ now: new Date("2026-12-10T04:30:00Z") });
    seedWedding(later, { paid: ["deposit"] });
    for (const s of later.db.rows("wedding_stages")) if (s.status === "not_started") s.nudged_at = "2026-11-20T04:30:00Z";
    const c = await nudgeStages(later.deps);
    expect(c.status === "done" && c.result.calls).toBe(3);
    expect(later.db.rows("tasks").every((t) => t.owner_role === "event_manager")).toBe(true);
  });
});
