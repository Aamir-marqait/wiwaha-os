import { describe, expect, it } from "vitest";
import { seedWedding, testWorld } from "../../framework/testing";
import { lockPlateCounts, onMenuApproved, proposeMenus } from "./agent";

function library(w: ReturnType<typeof testWorld>) {
  const dish = (cuisine: string, course: string, name: string, is_veg = true, sort = 10) => ({ id: `${cuisine}-${name}`, cuisine, course, name, is_veg, sort, active: true });
  w.db.rows("menu_library").push(
    dish("South Indian", "main", "Bisi bele bath"), dish("South Indian", "sweet", "Holige", true, 20), dish("South Indian", "main", "Chicken ghee roast", false, 30),
    dish("North Indian", "main", "Dal makhani"),
  );
}

describe("Menu", () => {
  it("proposes a menu per function from the library, honouring veg-only", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    library(w);
    w.db.rows("wedding_briefs").push({ wedding_id: "wd1", answers: { cuisines: "South Indian", veg_only: true } });
    const out = await proposeMenus(w.deps, "wd1");
    expect(out.status === "done" && out.result.proposed).toBe(2);
    const menus = w.db.rows("menus");
    expect(menus.every((m) => m.cuisine === "South Indian" && m.plate_count_lock_on === "2027-01-29")).toBe(true);
    expect(w.db.rows("menu_items").some((i) => i.name === "Chicken ghee roast")).toBe(false);
    expect(menus[0]!.per_plate_paise).toBe(1_200_00);
    expect(w.db.rows("tasks").some((t) => /tasting/.test(String(t.title)))).toBe(true);
    expect(w.store.messages[0]!.status).toBe("pending_approval");
    // Running again proposes nothing new.
    const again = await proposeMenus(w.deps, "wd1");
    expect(again.status === "done" && again.result.proposed).toBe(0);
  });

  it("asks the chef to confirm an approved menu, and locks plate counts on the lock date", async () => {
    const w = testWorld({ now: new Date("2027-01-29T04:30:00Z") });
    seedWedding(w, { paid: ["deposit", "contract"] });
    w.db.rows("menus").push({ id: "m1", wedding_id: "wd1", function_id: "fn-haldi", cuisine: "South Indian", plate_count: 120, plate_count_lock_on: "2027-01-29", plate_count_locked_at: null, status: "client_approved", outside_caterer: false });
    await onMenuApproved(w.deps, "m1");
    expect(w.db.rows("tasks").some((t) => /Chef to confirm the Haldi menu/.test(String(t.title)))).toBe(true);
    const out = await lockPlateCounts(w.deps);
    expect(out.status === "done" && out.result.locked).toBe(1);
    expect(w.db.rows("menus")[0]!.plate_count_locked_at).toBeTruthy();
  });
});
