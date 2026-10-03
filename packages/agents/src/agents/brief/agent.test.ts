import { describe, expect, it } from "vitest";
import { decide, seedWedding, testWorld } from "../../framework/testing";
import { onBriefDecided, onBriefSubmitted } from "./agent";

describe("Brief", () => {
  it("spots gaps and setup flags, and hands the brief to the event manager", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    w.db.rows("wedding_briefs").push({ wedding_id: "wd1", answers: { special_requests: "Baraat on a horse, kids' corner please" }, status: "draft" });
    const out = await onBriefSubmitted(w.deps, "wd1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.missing.join(" ")).toMatch(/cuisines/);
    const approval = w.store.approvals[0]!;
    expect(approval.kind).toBe("brief");
    const flags = (approval.payload as { flags: string[] }).flags.join(" ");
    expect(flags).toMatch(/Sacred fire/);
    expect(flags).toMatch(/Baraat/);
    expect(flags).toMatch(/Children/);
    // The couple is asked for the gap, through approval.
    expect(w.store.messages[0]).toMatchObject({ status: "pending_approval" });
    expect(w.store.messages[0]!.body).toMatch(/cuisines/);
    expect(w.db.rows("wedding_briefs")[0]).toMatchObject({ status: "submitted" });
  });

  it("an approved review closes the brief stage", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    w.db.rows("wedding_briefs").push({ wedding_id: "wd1", answers: { cuisines: "South Indian" }, status: "draft" });
    const out = await onBriefSubmitted(w.deps, "wd1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result.missing).toEqual([]);
    decide(w, out.result.approvalId);
    await onBriefDecided(w.deps, out.result.approvalId, "approved");
    expect(w.db.rows("wedding_briefs")[0]).toMatchObject({ status: "reviewed" });
    expect(w.db.rows("wedding_stages").find((s) => s.key === "brief")).toMatchObject({ status: "done" });
  });
});
