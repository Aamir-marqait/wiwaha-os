import { describe, expect, it } from "vitest";
import { onboardWedding } from "../agents/onboarding/agent";
import { seedWedding, testWorld } from "./testing";

describe("WhatsApp switched off (D44)", () => {
  it("drafts nothing on WhatsApp; email still goes", async () => {
    const w = testWorld();
    w.store.setPolicy("messaging.channels", { whatsapp: false, email: true });
    seedWedding(w, { paid: ["deposit"] });
    const out = await onboardWedding(w.deps, "wd1");
    expect(out.status).toBe("done");
    expect(w.store.messages.map((m) => m.channel)).toEqual(["email"]);
    expect(w.store.approvals.every((a) => (a.payload as { channel?: string }).channel !== "whatsapp")).toBe(true);
    expect(w.store.actions.some((a) => a.action === "message_skipped")).toBe(true);
  });
});
