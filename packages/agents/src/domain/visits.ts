import type { PolicyBook } from "@wiwaha/policy";
import { where, type Db } from "../framework/db";

/**
 * Site-visit slots and booking. Shared by the Voice Concierge, the team
 * dashboard and the website chat; rules come from policy "visits.booking".
 * The database stops an executive being double-booked (exclusion constraint).
 */

export interface AvailabilityRow { profile_id: string; weekday: number; start_time: string; end_time: string }
export interface TimeOffRow { profile_id: string; starts_at: string; ends_at: string }
export interface BusyVisit { executive_id: string | null; scheduled_at: string; slot_end: string; status: string }
export interface Slot { startsAt: string; endsAt: string; executiveId: string }

const IST_OFFSET_MIN = 330;
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const istIso = (date: string, minutes: number) => {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return new Date(`${date}T${h}:${m}:00+05:30`).toISOString();
};
/** Weekday (0 = Sunday) of a YYYY-MM-DD date in India. */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00+05:30`).getUTCDay();

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Free slots on one day. Each executive's windows are intersected with the
 * estate's visiting hours; with no availability set up yet, every sales
 * executive is treated as available during visiting hours.
 */
export function slotsForDay(input: {
  book: PolicyBook;
  date: string;
  now: Date;
  executives: string[];
  availability: AvailabilityRow[];
  timeOff: TimeOffRow[];
  busy: BusyVisit[];
}): Slot[] {
  const rules = input.book.get("visits.booking");
  const wd = weekdayOf(input.date);
  if (!rules.days_open.includes(wd)) return [];
  const open = toMin(rules.open_from), close = toMin(rules.open_until), len = rules.slot_minutes;
  const earliest = input.now.getTime() + rules.lead_time_hours * 3600_000;
  const out: Slot[] = [];
  const configured = new Set(input.availability.map((a) => a.profile_id));
  for (const exec of input.executives) {
    const windows = configured.has(exec)
      ? input.availability.filter((a) => a.profile_id === exec && a.weekday === wd).map((a) => [Math.max(open, toMin(a.start_time)), Math.min(close, toMin(a.end_time))] as const)
      : [[open, close] as const];
    for (const [from, to] of windows) {
      for (let t = from; t + len <= to; t += len) {
        const startsAt = istIso(input.date, t), endsAt = istIso(input.date, t + len);
        const s = Date.parse(startsAt), e = Date.parse(endsAt);
        if (s < earliest) continue;
        const clash = input.busy.some((v) => v.executive_id === exec && ["scheduled", "rescheduled"].includes(v.status) && Date.parse(v.scheduled_at) < e && Date.parse(v.slot_end) > s)
          || input.timeOff.some((o) => o.profile_id === exec && Date.parse(o.starts_at) < e && Date.parse(o.ends_at) > s);
        if (!clash) out.push({ startsAt, endsAt, executiveId: exec });
      }
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.executiveId.localeCompare(b.executiveId));
}

/** Loads everything slotsForDay needs and returns free slots from `fromDate` for up to `days` days. */
export async function findSlots(db: Db, book: PolicyBook, now: Date, fromDate: string, days = 7, limit = 6): Promise<Slot[]> {
  const execs = await db.select<{ id: string }>("profiles", { where: { role: "sales", active: true } });
  if (execs.length === 0) return [];
  const ids = execs.map((e) => e.id);
  const availability = await db.select<AvailabilityRow>("exec_availability", { where: { profile_id: where.in(ids) } });
  const until = addDaysIso(fromDate, days + 1);
  const timeOff = await db.select<TimeOffRow>("exec_time_off", { where: { profile_id: where.in(ids), ends_at: where.gte(`${fromDate}T00:00:00+05:30`) } });
  const busy = await db.select<BusyVisit>("visits", { where: { executive_id: where.in(ids), scheduled_at: where.lt(`${until}T00:00:00+05:30`), slot_end: where.gt(`${fromDate}T00:00:00+05:30`) } });
  const out: Slot[] = [];
  for (let i = 0; i < days && out.length < limit; i++) {
    const date = addDaysIso(fromDate, i);
    // One slot per start time is enough to offer; keep the first executive free then.
    const seen = new Set<string>();
    for (const s of slotsForDay({ book, date, now, executives: ids, availability, timeOff, busy })) {
      if (seen.has(s.startsAt)) continue;
      seen.add(s.startsAt);
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export interface BookVisitInput {
  leadId: string;
  slot: Slot;
  attendees?: string | null;
  attendeeCount?: number | null;
  bookedByAgent?: string | null;
  notes?: string | null;
}

/**
 * Books a visit: inserts it (the DB refuses a double-booking), moves the lead
 * to "visit booked", and leaves a 'visit_booked' task so the Visit Host sends
 * the confirmation and the executive's brief (agents never call each other).
 */
export async function bookVisit(db: Db, book: PolicyBook, input: BookVisitInput): Promise<{ visitId: string }> {
  const rules = book.get("visits.booking");
  const followUp = book.get("followup.after_visit");
  const [lead] = await db.select<{ id: string; status: string; assigned_to: string | null }>("leads", { where: { id: input.leadId } });
  if (!lead) throw new Error("Lead not found");
  const prior = await db.select<{ id: string }>("visits", { where: { lead_id: input.leadId } });
  const scheduled = Date.parse(input.slot.startsAt);
  const [visit] = await db.insert<{ id: string }>("visits", {
    lead_id: input.leadId,
    visit_number: prior.length + 1,
    scheduled_at: input.slot.startsAt,
    duration_minutes: rules.slot_minutes,
    slot_end: input.slot.endsAt,
    executive_id: input.slot.executiveId,
    attendees: input.attendees ?? null,
    attendee_count: input.attendeeCount ?? null,
    status: "scheduled",
    booked_by_agent: input.bookedByAgent ?? null,
    notes: input.notes ?? null,
    follow_up_due_at: new Date(scheduled + followUp.days_after_visit * 86_400_000).toISOString(),
  });
  if (["new", "contacted"].includes(lead.status)) {
    await db.update("leads", { id: input.leadId }, { status: "visit_booked", ...(lead.assigned_to ? {} : { assigned_to: input.slot.executiveId }) });
  }
  await db.insert("agent_tasks", { kind: "visit_booked", from_agent: input.bookedByAgent ?? null, lead_id: input.leadId, payload: { visit_id: visit!.id } });
  return { visitId: visit!.id };
}

/** "Saturday 12 October, 11:00 am" in India time. */
export function formatSlot(iso: string, locale = "en-IN"): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return `${date}, ${time}`;
}

export const IST_OFFSET_MINUTES = IST_OFFSET_MIN;
