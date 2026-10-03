import type { Json } from "@wiwaha/db";
import { formatDateIST } from "@wiwaha/db";
import { where } from "../../framework/db";
import { agentDb, alertStaff, istInstant, proposeClientMessage } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { ROOMS_GATE } from "./gate";
import { ROOMS_TOOLS } from "./tools";

export const ROOMS_GUESTS = "rooms_guests";

interface Room { id: string; number: string; room_type: string; capacity: number; status: string; sort: number }
interface Alloc { id: string; wedding_id: string; room_id: string | null; guest_name: string; party_size: number; check_in: string; check_out: string; complimentary: boolean; needs_pickup: boolean; pickup_at: string | null; pickup_from: string | null; status: string; created_at: string }

const overlaps = (a: { check_in: string; check_out: string }, b: { check_in: string; check_out: string }) => a.check_in < b.check_out && b.check_in < a.check_out;

/** Rooming list submitted: place every guest without double-booking, then schedule housekeeping and pickups. */
export async function allocateRooms(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ placed: number; complimentary: number; unplaced: number; pickups: number }>> {
  return runAgent(deps, ROOMS_GUESTS, { action: "allocate_rooms", weddingId, input: {}, fallbackTitle: "Allocate rooms from the rooming list" }, async (ctx) => {
    const db = agentDb(ctx, ROOMS_TOOLS);
    const ops = ctx.book.get("rooms.operations");
    const [w] = await db.select<{ id: string; title: string; complimentary_rooms: number; event_manager_id: string | null; primary_contact_id: string | null }>("weddings", { where: { id: weddingId } });
    if (!w) throw new Error("Wedding not found");
    const rooms = (await db.select<Room>("rooms", { where: { active: true, status: "available" }, order: [{ column: "sort" }] }));
    const all = await db.select<Alloc>("room_allocations", { where: { status: where.neq("cancelled") }, order: [{ column: "created_at" }] });
    const occupied = all.filter((a) => a.room_id);
    const mine = all.filter((a) => a.wedding_id === weddingId);
    let compLeft = w.complimentary_rooms - mine.filter((a) => a.room_id && a.complimentary).length;
    let placed = 0, unplaced = 0, complimentary = 0;
    for (const a of mine.filter((x) => !x.room_id)) {
      const free = rooms.filter((r) => !occupied.some((o) => o.room_id === r.id && overlaps(o, a)));
      const room = free.filter((r) => r.capacity >= a.party_size).sort((x, y) => x.capacity - y.capacity || x.sort - y.sort)[0] ?? free.sort((x, y) => y.capacity - x.capacity)[0];
      if (!room) { unplaced++; continue; }
      const comp = compLeft > 0;
      await db.update("room_allocations", { id: a.id }, { room_id: room.id, status: "confirmed", complimentary: comp });
      occupied.push({ ...a, room_id: room.id });
      if (comp) { compLeft--; complimentary++; }
      placed++;
    }
    // Housekeeping: rooms ready before check-in, per arrival day.
    const confirmed = (await db.select<Alloc>("room_allocations", { where: { wedding_id: weddingId, status: where.in(["confirmed", "planned"]), room_id: where.notNull() } }));
    const existingTasks = await db.select<{ title: string }>("tasks", { where: { wedding_id: weddingId } });
    const hasTask = (title: string) => existingTasks.some((t) => t.title === title);
    const byDay = new Map<string, number>();
    for (const a of confirmed) byDay.set(a.check_in, (byDay.get(a.check_in) ?? 0) + 1);
    for (const [day, count] of byDay) {
      const title = `Prepare ${count} room${count > 1 ? "s" : ""} for ${w.title} (check-in ${formatDateIST(day)})`;
      if (hasTask(title)) continue;
      const due = new Date(Date.parse(istInstant(day, ops.check_in_time)) - count * ops.housekeeping_minutes_per_room * 60_000).toISOString();
      await db.insert("tasks", { scope: "wedding", wedding_id: weddingId, title, description: `Rooms: ${confirmed.filter((a) => a.check_in === day).map((a) => rooms.find((r) => r.id === a.room_id)?.number ?? "?").join(", ")}. Check-in from ${ops.check_in_time}.`, owner_role: "staff", due_at: due, priority: "high", proof_kind: "photo", created_by_agent: ROOMS_GUESTS });
    }
    // Airport pickups.
    let pickups = 0;
    for (const a of mine.filter((x) => x.needs_pickup && x.pickup_at)) {
      const title = `Airport pickup: ${a.guest_name} (${a.party_size}) from ${a.pickup_from ?? ops.pickup_points[0] ?? "the airport"}`;
      if (hasTask(title)) continue;
      await db.insert("tasks", { scope: "wedding", wedding_id: weddingId, title, description: `Landing ${new Date(a.pickup_at!).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. Car and driver at arrivals 15 minutes early.`, owner_role: "staff", due_at: new Date(Date.parse(a.pickup_at!) - 90 * 60_000).toISOString(), priority: "high", proof_kind: "tick", created_by_agent: ROOMS_GUESTS });
      pickups++;
    }
    // Parking: one plan per wedding, sized from the guest list.
    const guests = mine.reduce((s, a) => s + a.party_size, 0);
    const parking = `Parking plan for ${w.title} (about ${Math.max(1, Math.ceil(guests / 3))} cars from the rooming list)`;
    if (guests && !existingTasks.some((t) => t.title.startsWith(`Parking plan for ${w.title}`))) {
      const firstIn = [...mine].sort((a, b) => a.check_in.localeCompare(b.check_in))[0]!.check_in;
      await db.insert("tasks", { scope: "wedding", wedding_id: weddingId, title: parking, owner_role: "staff", due_at: istInstant(firstIn, "09:00"), priority: "normal", proof_kind: "tick", created_by_agent: ROOMS_GUESTS });
    }
    if (unplaced) await alertStaff(deps, { userIds: w.event_manager_id ? [w.event_manager_id] : undefined, role: w.event_manager_id ? undefined : ROOMS_GATE.escalateTo, title: `${unplaced} guest${unplaced > 1 ? "s" : ""} without a room: ${w.title}`, body: "All available rooms are taken for those nights. Please arrange nearby stays or adjust the list with the couple.", link: `/team/weddings/${weddingId}`, weddingId, whatsapp: true });
    if (placed) {
      await proposeClientMessage(ctx, { channel: "portal", to: null, weddingId, approvalKind: ROOMS_GATE.messageApproval, title: `Rooms allocated for ${w.title}`, body: `We've placed ${placed} of your guests in their rooms${complimentary ? ` (${complimentary} complimentary, as in your booking)` : ""}.${pickups ? ` ${pickups} airport pickup${pickups > 1 ? "s are" : " is"} scheduled.` : ""}${unplaced ? ` ${unplaced} still need a room and your event manager will be in touch.` : ""} Check-in is from ${ops.check_in_time} and check-out by ${ops.check_out_time}.\n\nWarmly,\nTeam Wiwaha` });
    }
    await ctx.log({ action: "allocate_rooms", status: unplaced ? "escalated" : "ok", weddingId, input: { guests: mine.length }, output: { placed, complimentary, unplaced, pickups } as Json, policyKeys: ["rooms.operations"], policyVersions: ctx.book.versions(["rooms.operations"]) });
    return { placed, complimentary, unplaced, pickups };
  });
}
