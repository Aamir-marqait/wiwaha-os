import { describe, expect, it } from "vitest";
import { ScriptedLlm } from "../../framework/llm";
import { decide, testWorld } from "../../framework/testing";
import { draftWeek, nextMonday, onPostsDecided } from "./agent";

describe("Content Studio", () => {
  it("drafts a week of posts in the brand rhythm, one approval per day, nothing posted", async () => {
    const w = testWorld(); // Saturday 3 Oct 2026
    w.db.rows("reviews").push({ testimonial: "The team handled everything; we just danced.", publish_consent: true, submitted_at: "2026-09-01T00:00:00Z" });
    const out = await draftWeek(w.deps);
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result).toEqual({ weekOf: "2026-10-05", posts: 35, approvals: 7 });
    const posts = w.db.rows("content_posts");
    expect(posts.find((p) => p.scheduled_for === "2026-10-05" && p.platform === "instagram")).toMatchObject({ theme: "Problem/Solution", status: "pending_approval" });
    expect(String(posts.find((p) => p.scheduled_for === "2026-10-07" && p.platform === "instagram")!.caption)).toMatch(/we just danced/);
    expect(posts.filter((p) => p.platform === "x").every((p) => String(p.caption).length <= 280)).toBe(true);
    expect(w.store.approvals.every((a) => a.kind === "social_post")).toBe(true);
    expect(w.db.rows("outbox")).toHaveLength(0);
    const again = await draftWeek(w.deps);
    expect(again.status === "done" && again.result.posts).toBe(0);
  });

  it("never lets a price or discount into a post", async () => {
    const w = testWorld({ llm: new ScriptedLlm(() => "Book now and get 20% off! Packages from ₹5 lakh.") });
    await draftWeek(w.deps);
    expect(w.db.rows("content_posts").some((p) => /₹|% off|discount/i.test(String(p.caption)))).toBe(false);
  });

  it("schedules a day's posts only after approval", async () => {
    const w = testWorld();
    await draftWeek(w.deps);
    const a = w.store.approvals[0]!;
    decide(w, a.id);
    const out = await onPostsDecided(w.deps, a.id, "approved");
    expect(out.status === "done" && out.result.scheduled).toBe(5);
    expect(w.db.rows("outbox").filter((o) => o.kind === "social_post")).toHaveLength(5);
    expect(nextMonday("2026-10-05", "mon")).toBe("2026-10-12");
  });
});
