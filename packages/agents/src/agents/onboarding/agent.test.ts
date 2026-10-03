import { describe, expect, it } from "vitest";
import { seedWedding, testWorld } from "../../framework/testing";
import { onboardWedding } from "./agent";

describe("Onboarding", () => {
  it("invites the family to the portal, drafts the welcome letter, and asks for the WhatsApp group", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    const invites: string[] = [];
    w.deps.auth = { inviteClient: async ({ email }) => { invites.push(email); return { ok: true }; } };
    const out = await onboardWedding(w.deps, "wd1");
    expect(out.status === "done" && out.result).toEqual({ invited: 2, letters: 2 });
    expect(invites.sort()).toEqual(["ananya@example.com", "rohan@example.com"]);
    expect(w.db.rows("wedding_members").every((m) => m.member_role === "couple" && m.can_start_stages === true)).toBe(true);
    // Welcome letter on WhatsApp and email, both waiting for approval.
    expect(w.store.messages.map((m) => [m.channel, m.status])).toEqual([["whatsapp", "pending_approval"], ["email", "pending_approval"]]);
    expect(w.store.messages[0]!.body).toMatch(/Arjun will be your event manager/);
    expect(w.store.messages[0]!.body).not.toMatch(/₹/);
    const task = w.db.rows("tasks").find((t) => t.title === "Create the family WhatsApp group")!;
    expect(String(task.description)).toMatch(/Ananya Iyer/);
    expect(String(task.description)).toMatch(/Prashanth \(Wiwaha\)/);
    expect(w.db.rows("weddings")[0]).toMatchObject({ stage: "planning" });
  });

  it("is safe to run twice", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    await onboardWedding(w.deps, "wd1");
    await onboardWedding(w.deps, "wd1");
    expect(w.db.rows("wedding_members")).toHaveLength(2);
    expect(w.db.rows("tasks").filter((t) => t.title === "Create the family WhatsApp group")).toHaveLength(1);
  });
});
