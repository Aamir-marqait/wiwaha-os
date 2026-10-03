import { describe, expect, it } from "vitest";
import { seedWedding, testWorld } from "../../framework/testing";
import { allocateRooms } from "./agent";

function rooms(w: ReturnType<typeof testWorld>, n: number) {
  for (let i = 1; i <= n; i++) w.db.rows("rooms").push({ id: `r${i}`, number: String(100 + i), room_type: i === n ? "suite" : "deluxe", capacity: i === n ? 4 : 2, status: "available", active: true, sort: i });
}
const guest = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, wedding_id: "wd1", room_id: null, guest_name: name, party_size: 2, check_in: "2027-02-11", check_out: "2027-02-14", complimentary: false, needs_pickup: false, pickup_at: null, pickup_from: null, status: "planned", created_at: `2026-12-01T00:00:0${id.slice(-1)}Z`, ...extra });

describe("Rooms & Guests", () => {
  it("places guests without double-booking and marks complimentary rooms up to the booking", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit", "contract"] });
    w.db.rows("weddings")[0]!.complimentary_rooms = 2;
    rooms(w, 4);
    // Another wedding already has room 101 on overlapping nights.
    w.db.rows("room_allocations").push({ id: "other", wedding_id: "wd2", room_id: "r1", guest_name: "Other", party_size: 2, check_in: "2027-02-10", check_out: "2027-02-12", status: "confirmed", created_at: "2026-11-01T00:00:00Z" });
    w.db.rows("room_allocations").push(guest("g1", "Iyer family", { party_size: 4, needs_pickup: true, pickup_at: "2027-02-11T05:00:00Z", pickup_from: "BLR T2" }), guest("g2", "Kulkarni family"), guest("g3", "Rao family"), guest("g4", "Menon family"));
    const out = await allocateRooms(w.deps, "wd1");
    if (out.status !== "done") throw new Error(out.status);
    expect(out.result).toMatchObject({ placed: 3, complimentary: 2, unplaced: 1, pickups: 1 });
    const mine = w.db.rows("room_allocations").filter((a) => a.wedding_id === "wd1" && a.room_id);
    expect(mine.map((a) => a.room_id)).not.toContain("r1");
    expect(mine.find((a) => a.id === "g1")!.room_id).toBe("r4"); // the party of four gets the suite
    expect(new Set(mine.map((a) => a.room_id)).size).toBe(mine.length);
    expect(w.db.rows("tasks").some((t) => /Airport pickup: Iyer family \(4\) from BLR T2/.test(String(t.title)))).toBe(true);
    expect(w.db.rows("tasks").some((t) => /Prepare 3 rooms/.test(String(t.title)))).toBe(true);
    expect(w.db.rows("outbox").some((o) => o.to_address === "+919800000003")).toBe(true); // event manager told about the unplaced guest
    expect(w.store.messages[0]).toMatchObject({ status: "pending_approval", channel: "portal" });
  });
});
