/**
 * "Add to Google Calendar" links (D42): one tap from a visit or a wedding puts it
 * in the person's own Google Calendar. (The subscribed feed on the Calendar
 * page keeps everything in sync; these are for one event at a time.)
 */
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10).replace(/-/g, ""); };

export const VENUE_LOCATION = "Wiwaha by Praman, Devanahalli, Bengaluru";

export function googleCalendarLink(e: { title: string; start: string; end?: string | null; minutes?: number; allDay?: boolean; details?: string; location?: string }): string {
  const dates = e.allDay
    ? `${day(e.start)}/${nextDay(e.end ?? e.start)}`
    : `${stamp(e.start)}/${stamp(e.end ?? new Date(Date.parse(e.start) + (e.minutes ?? 60) * 60_000).toISOString())}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, ...(e.details ? { details: e.details } : {}), location: e.location ?? VENUE_LOCATION, ctz: "Asia/Kolkata" });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
