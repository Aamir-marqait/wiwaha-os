import { where, type Db } from "../framework/db";
import { addDaysIso } from "./visits";

/** Spaces that can seat the guests and aren't held or booked on the date. */
export async function freeSpacesOn(db: Db, date: string, guests: number | null, now: Date): Promise<{ id: string; name: string; capacity: number }[]> {
  const spaces = await db.select<{ id: string; name: string; capacity_seated: number; active: boolean }>("spaces", { where: { active: true } });
  const fit = spaces.filter((s) => !guests || s.capacity_seated >= guests);
  if (fit.length === 0) return [];
  const blocking = await db.select<{ space_id: string | null; status: string; expires_at: string | null }>("calendar_entries", {
    where: { space_id: where.in(fit.map((s) => s.id)), starts_on: where.lte(date), ends_on: where.gte(date), status: where.in(["confirmed", "held"]) },
  });
  const taken = new Set(blocking.filter((b) => b.status === "confirmed" || (b.expires_at && Date.parse(b.expires_at) > now.getTime())).map((b) => b.space_id));
  return fit.filter((s) => !taken.has(s.id)).map((s) => ({ id: s.id, name: s.name, capacity: s.capacity_seated })).sort((a, b) => b.capacity - a.capacity);
}

/** Up to `limit` open dates closest to `date` (alternating after/before), within `range` days. */
export async function nearbyFreeDates(db: Db, date: string, guests: number | null, now: Date, limit = 3, range = 10): Promise<string[]> {
  const out: string[] = [];
  const today = now.toISOString().slice(0, 10);
  for (let i = 1; i <= range && out.length < limit; i++) {
    for (const d of [addDaysIso(date, i), addDaysIso(date, -i)]) {
      if (d <= today || out.length >= limit) continue;
      if ((await freeSpacesOn(db, d, guests, now)).length > 0) out.push(d);
    }
  }
  return out.sort();
}
