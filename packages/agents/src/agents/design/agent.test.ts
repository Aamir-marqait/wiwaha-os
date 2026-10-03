import { describe, expect, it } from "vitest";
import { decide, seedWedding, testWorld } from "../../framework/testing";
import { generateMoodboards, onCustomDecided, onFinalised, onShortlisted } from "./agent";

describe("Design", () => {
  it("can't create décor before the 40% payment, whatever asks it", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    const out = await generateMoodboards(w.deps, "wd1");
    expect(out.status).toBe("error");
    expect(w.db.rows("moodboards")).toHaveLength(0);
    expect(w.store.messages).toHaveLength(0);
  });

  it("after the 40% payment: about five broad themes per function, standard and custom labelled", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    const out = await generateMoodboards(w.deps, "wd1");
    expect(out.status === "done" && out.result.created).toBe(10);
    const boards = w.db.rows("moodboards");
    expect(boards.filter((b) => b.function_id === "fn-haldi")).toHaveLength(5);
    expect(new Set(boards.map((b) => b.design_kind))).toEqual(new Set(["standard", "custom"]));
    expect(boards.every((b) => b.round === 1)).toBe(true);
  });

  it("refines a shortlisted board, and sends custom décor to Prashanth when finalised", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    await generateMoodboards(w.deps, "wd1");
    const custom = w.db.rows("moodboards").find((b) => b.design_kind === "custom" && b.function_id === "fn-wed")!;
    custom.client_feedback = "More jasmine, less red";
    const s = await onShortlisted(w.deps, String(custom.id));
    expect(s.status === "done" && s.result.details).toBe(2);
    expect(w.db.rows("moodboards").filter((b) => b.parent_id === custom.id).every((b) => /jasmine/.test(String(b.description)))).toBe(true);

    custom.status = "finalised";
    const f = await onFinalised(w.deps, String(custom.id));
    if (f.status !== "done" || !f.result.approvalId) throw new Error("expected approval");
    expect(w.store.approvals.at(-1)!.kind).toBe("custom_decor");
    decide(w, f.result.approvalId);
    const d = await onCustomDecided(w.deps, f.result.approvalId, "approved");
    expect(d.status === "done" && d.result.approved).toBe(true);
    expect(w.db.rows("moodboards").find((b) => b.id === custom.id)).toMatchObject({ status: "approved" });
  });

  it("a finalised standard board needs no approval", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    await generateMoodboards(w.deps, "wd1");
    const std = w.db.rows("moodboards").find((b) => b.design_kind === "standard")!;
    std.status = "finalised";
    const f = await onFinalised(w.deps, String(std.id));
    expect(f.status === "done" && f.result.approvalId).toBe(null);
  });
});
