import { Card, CardHeader, PageTitle, cn } from "@wiwaha/ui";
import { addDays, formatDateIST, todayIST, type AvailabilityRow, type CalendarStatus } from "@wiwaha/db";
import { PolicyBook, type PolicyRow } from "@wiwaha/policy";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { relativeFromNow } from "@/components/time";
import { requireSection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { releaseEntry } from "../leads/actions";
import { confirmEntry } from "./actions";
import { HoldPanel } from "./hold-panel";

export const metadata = { title: "Calendar" };

const CELL: Record<CalendarStatus, string> = {
  enquiry: "bg-[var(--cal-enquiry)] text-[var(--cal-enquiry-ink)]",
  held: "bg-[var(--cal-held)] text-[var(--cal-held-ink)] ring-1 ring-inset ring-burgundy-300",
  confirmed: "bg-[var(--cal-confirmed)] text-[var(--cal-confirmed-ink)]",
  released: "",
};
const VISIT = "bg-[#dbe7f5] text-[#25476f]";
const LABEL: Record<CalendarStatus, string> = { enquiry: "Enquiry", held: "Held", confirmed: "Confirmed", released: "Released" };

function monthBounds(month: string): { from: string; to: string; days: string[] } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const from = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: last }, (_, i) => addDays(from, i));
  return { from, to: days[days.length - 1]!, days };
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string; pick?: string; date?: string; entry?: string }> }) {
  const viewer = await requireSection("venue");
  const sp = await searchParams;
  const today = todayIST();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const view = sp.view === "rooms" ? "rooms" : "spaces";
  const { from, to, days } = monthBounds(month);
  const supabase = await createClient();

  const seesLeads = ["owner", "sales", "event_manager"].includes(viewer.profile.role);
  const none = Promise.resolve({ data: [] as Record<string, unknown>[] });
  const [avail, holds, spaces, rooms, visits] = await Promise.all([
    supabase.rpc("availability", { p_from: from, p_to: to }),
    supabase.from("calendar_entries").select("id, label, starts_on, ends_on, expires_at, resource_kind, space:spaces(name), room:rooms(number)").eq("status", "held").gt("expires_at", new Date().toISOString()).order("expires_at").limit(20),
    supabase.from("spaces").select("id, name").eq("active", true).order("sort"),
    supabase.from("rooms").select("id, number").eq("active", true).order("sort"),
    seesLeads ? supabase.from("visits").select("id, scheduled_at, visit_number, lead:leads(id, contact:contacts(full_name))").gte("scheduled_at", `${from}T00:00:00+05:30`).lte("scheduled_at", `${to}T23:59:59+05:30`).neq("status", "cancelled").order("scheduled_at") : none,
  ]);
  type Visit = { leadId: string; name: string; time: string };
  const visitDays = new Map<string, Visit[]>();
  const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
  for (const v of (visits.data ?? []) as Record<string, unknown>[]) {
    const lead = one(v.lead as { id: string; contact: { full_name: string } | { full_name: string }[] | null } | null);
    if (!lead) continue;
    const at = String(v.scheduled_at);
    const day = new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    visitDays.set(day, [...(visitDays.get(day) ?? []), { leadId: lead.id, name: one(lead.contact)?.full_name ?? "Lead", time: new Date(at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) }]);
  }
  const rows = ((avail.data ?? []) as AvailabilityRow[]).filter((r) => r.resource_kind === (view === "rooms" ? "room" : "space"));
  const canHold = ["owner", "sales", "event_manager"].includes(viewer.profile.role);
  const canConfirm = ["owner", "sales"].includes(viewer.profile.role);

  // Group by resource for the grid, and by day for the phone agenda.
  const byResource = new Map<string, { name: string; capacity: number; cells: Map<string, AvailabilityRow> }>();
  const byDay = new Map<string, AvailabilityRow[]>();
  const entryDays = new Map<string, AvailabilityRow[]>();
  for (const r of rows) {
    const res = byResource.get(r.resource_id) ?? { name: r.resource_name, capacity: r.capacity, cells: new Map() };
    res.cells.set(r.day, r);
    byResource.set(r.resource_id, res);
    if (r.status) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
    if (r.entry_id) entryDays.set(r.entry_id, [...(entryDays.get(r.entry_id) ?? []), r]);
  }
  const base = `/team/calendar?month=${month}&view=${view}`;
  const kind = view === "rooms" ? "room" : "space";
  const pickedEntry = sp.entry ? entryDays.get(sp.entry) : undefined;
  const picked = pickedEntry?.[0];
  const pickedDays = (pickedEntry ?? []).map((r) => r.day).sort();
  const prefill = !picked && sp.pick ? { resource: sp.pick, date: sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : "" } : null;

  return (
    <>
      <PageTitle title="Calendar" subtitle="Tap a day on a space or room to book it, or tap a booking to see it. Spaces, rooms and site visits all show here." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-line">
          <Link href={`/team/calendar?month=${shiftMonth(month, -1)}&view=${view}`} className="rounded-full px-3 py-1 text-sm hover:bg-ivory-100" aria-label="Previous month">←</Link>
          <span className="min-w-36 text-center font-serif text-lg font-semibold">{formatDateIST(from, { month: "long", year: "numeric" })}</span>
          <Link href={`/team/calendar?month=${shiftMonth(month, 1)}&view=${view}`} className="rounded-full px-3 py-1 text-sm hover:bg-ivory-100" aria-label="Next month">→</Link>
        </div>
        <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-line">
          {(["spaces", "rooms"] as const).map((v) => (
            <Link key={v} href={`/team/calendar?month=${month}&view=${v}`} className={cn("rounded-full px-3 py-1 text-sm capitalize", v === view ? "bg-sage-700 text-white" : "hover:bg-ivory-100")}>{v}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-ink-soft sm:ml-auto">
          {(["enquiry", "held", "confirmed"] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><span className={cn("inline-block size-3 rounded", CELL[s])} />{LABEL[s]}</span>)}
          {seesLeads ? <span className="flex items-center gap-1.5"><span className={cn("inline-block size-3 rounded", VISIT)} />Site visit</span> : null}
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_300px]">
        <Card className="min-w-0 self-start overflow-hidden">
          {/* Grid: tablets and up. Every cell is a tap target. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-40 bg-ivory-100 px-3 py-2 text-left font-medium text-ink-soft">{view === "rooms" ? "Room" : "Space"}</th>
                  {days.map((d) => {
                    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                    return <th key={d} className={cn("min-w-8 bg-ivory-100 px-0.5 py-2 text-center font-medium", d === today ? "text-sage-800" : "text-ink-soft", dow === 0 || dow === 6 ? "bg-ivory-200" : "")}>{Number(d.slice(8))}<div className="text-[9px] font-normal">{"SMTWTFS"[dow]}</div></th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {seesLeads ? (
                  <tr>
                    <td className="sticky left-0 z-10 border-t border-line bg-white px-3 py-1.5"><span className="font-medium text-ink">Site visits</span></td>
                    {days.map((d) => {
                      const v = visitDays.get(d);
                      return (
                        <td key={d} className="border-t border-l border-line/60 p-0.5">
                          {v ? <Link href={`/team/leads/${v[0]!.leadId}`} title={v.map((x) => `${x.time} ${x.name}`).join("\n")} className={cn("block h-7 rounded text-center text-[10px] leading-7", VISIT)}>{v.length}</Link> : <div className="h-7" />}
                        </td>
                      );
                    })}
                  </tr>
                ) : null}
                {[...byResource.entries()].map(([id, res]) => (
                  <tr key={id}>
                    <td className="sticky left-0 z-10 border-t border-line bg-white px-3 py-1.5"><span className="font-medium text-ink">{res.name}</span><span className="ml-1 text-[10px] text-ink-soft">{res.capacity}</span></td>
                    {days.map((d) => {
                      const c = res.cells.get(d);
                      return (
                        <td key={d} className={cn("border-t border-l border-line/60 p-0.5", d === today ? "bg-sage-50" : "")}>
                          {c?.status ? (
                            <Link href={`${base}&entry=${c.entry_id ?? ""}`} title={`${c.label ?? LABEL[c.status]} · ${LABEL[c.status]}${c.expires_at ? ` · expires ${relativeFromNow(c.expires_at)}` : ""}`} className={cn("block h-7 truncate rounded px-0.5 text-center text-[9px] leading-7", CELL[c.status])}>{c.status === "confirmed" ? "●" : c.status === "held" ? "H" : "?"}</Link>
                          ) : canConfirm ? (
                            <Link href={`${base}&pick=${kind}:${id}&date=${d}`} aria-label={`Book ${res.name} on ${d}`} className={cn("block h-7 rounded hover:bg-sage-100", prefill?.resource === `${kind}:${id}` && prefill.date === d ? "bg-sage-200 ring-1 ring-sage-600" : "")} />
                          ) : <div className="h-7" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Agenda: phones. Book from the panel below. */}
          <ul className="divide-y divide-line/70 sm:hidden">
            {byDay.size === 0 && visitDays.size === 0 ? <li className="px-4 py-6 text-center text-sm text-ink-soft">Every {view === "rooms" ? "room" : "space"} is free this month.</li> : null}
            {[...new Set([...byDay.keys(), ...visitDays.keys()])].sort().map((day) => (
              <li key={day} className="px-4 py-3">
                <p className="text-sm font-semibold">{formatDateIST(day, { weekday: "short", day: "numeric", month: "short" })}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {(byDay.get(day) ?? []).map((e) => <li key={`${e.resource_id}`}><Link href={`${base}&entry=${e.entry_id ?? ""}`} className={cn("block rounded-full px-2.5 py-1 text-xs", CELL[e.status!])}>{e.resource_name}{e.label ? ` · ${e.label}` : ""}</Link></li>)}
                  {(visitDays.get(day) ?? []).map((v) => <li key={`${v.leadId}${v.time}`}><Link href={`/team/leads/${v.leadId}`} className={cn("block rounded-full px-2.5 py-1 text-xs", VISIT)}>{v.time} visit · {v.name}</Link></li>)}
                </ul>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          {picked ? (
            <Card>
              <CardHeader title={picked.label ?? LABEL[picked.status!]} subtitle={`${picked.resource_name} · ${LABEL[picked.status!]}`} action={<Link href={base} className="text-sm text-sage-700 underline">Close</Link>} />
              <div className="space-y-3 p-4 text-sm">
                <p className="text-ink-soft">{formatDateIST(pickedDays[0]!)}{pickedDays.length > 1 ? ` – ${formatDateIST(pickedDays[pickedDays.length - 1]!)}` : ""}{picked.expires_at ? ` · expires ${relativeFromNow(picked.expires_at)}` : ""}</p>
                {canHold ? (
                  <div className="flex flex-wrap gap-2">
                    {canConfirm && picked.status !== "confirmed" ? <ActionButton action={confirmEntry.bind(null, picked.entry_id!)} variant="primary" confirm="Confirm this booking? Only do this once the deposit is in.">Confirm</ActionButton> : null}
                    <ActionButton action={releaseEntry.bind(null, picked.entry_id!, base)} variant="ghost" confirm="Free these dates?">Free these dates</ActionButton>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
          {canConfirm ? (
            <Card>
              <CardHeader title="Book a date" subtitle="Tap a day on the calendar, or fill this in. It blocks straight away." />
              <div className="p-4"><HoldPanel key={`${prefill?.resource}${prefill?.date}`} defaults={prefill} spaces={(spaces.data ?? []) as { id: string; name: string }[]} rooms={(rooms.data ?? []) as { id: string; number: string }[]} /></div>
            </Card>
          ) : null}
          {(holds.data ?? []).length ? (
          <Card>
            <CardHeader title="Waiting dates" subtitle="Older holds that haven't been confirmed yet" />
            <ul className="divide-y divide-line/70">
              {(holds.data ?? []).map((h) => {
                const space = (Array.isArray(h.space) ? h.space[0] : h.space) as { name: string } | null;
                const room = (Array.isArray(h.room) ? h.room[0] : h.room) as { number: string } | null;
                return (
                  <li key={h.id as string} className="px-4 py-3">
                    <p className="text-sm font-medium">{(h.label as string | null) ?? "Hold"}</p>
                    <p className="text-xs text-ink-soft">{space?.name ?? (room ? `Room ${room.number}` : "")} · {formatDateIST(h.starts_on as string)}{h.ends_on !== h.starts_on ? ` – ${formatDateIST(h.ends_on as string)}` : ""}</p>
                    <p className="text-xs text-burgundy-700">Expires {relativeFromNow(h.expires_at as string)}</p>
                    {canHold ? (
                      <div className="mt-2 flex gap-2">
                        {canConfirm ? <ActionButton action={confirmEntry.bind(null, h.id as string)} variant="primary" confirm="Confirm this booking? Only do this once the deposit is in.">Confirm</ActionButton> : null}
                        <ActionButton action={releaseEntry.bind(null, h.id as string, "/team/calendar")} variant="ghost" confirm="Release this hold?">Release</ActionButton>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
