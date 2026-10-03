import { Card, CardHeader, PageTitle, cn } from "@wiwaha/ui";
import { addDays, formatDateIST, todayIST, type AvailabilityRow, type CalendarStatus } from "@wiwaha/db";
import { PolicyBook, type PolicyRow } from "@wiwaha/policy";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { relativeFromNow } from "@/components/time";
import { requireStaff } from "@/lib/auth";
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

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const today = todayIST();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const view = sp.view === "rooms" ? "rooms" : "spaces";
  const { from, to, days } = monthBounds(month);
  const supabase = await createClient();

  const [avail, holds, spaces, rooms, policies] = await Promise.all([
    supabase.rpc("availability", { p_from: from, p_to: to }),
    supabase.from("calendar_entries").select("id, label, starts_on, ends_on, expires_at, resource_kind, space:spaces(name), room:rooms(number)").eq("status", "held").gt("expires_at", new Date().toISOString()).order("expires_at").limit(20),
    supabase.from("spaces").select("id, name").eq("active", true).order("sort"),
    supabase.from("rooms").select("id, number").eq("active", true).order("sort"),
    supabase.from("policies").select("key, topic, title, rule_text, value, version, client_visible, needs_confirmation, sort"),
  ]);
  const rows = ((avail.data ?? []) as AvailabilityRow[]).filter((r) => r.resource_kind === (view === "rooms" ? "room" : "space"));
  const book = PolicyBook.fromRows((policies.data ?? []) as PolicyRow[]);
  const holdHours = book.has("holds.soft_hold") ? book.get("holds.soft_hold").hours : 72;
  const canHold = ["owner", "sales", "event_manager"].includes(viewer.profile.role);
  const canConfirm = ["owner", "sales"].includes(viewer.profile.role);

  // Group by resource for the grid, and by day for the phone agenda.
  const byResource = new Map<string, { name: string; capacity: number; cells: Map<string, AvailabilityRow> }>();
  const byDay = new Map<string, AvailabilityRow[]>();
  for (const r of rows) {
    const res = byResource.get(r.resource_id) ?? { name: r.resource_name, capacity: r.capacity, cells: new Map() };
    res.cells.set(r.day, r);
    byResource.set(r.resource_id, res);
    if (r.status) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  }

  return (
    <>
      <PageTitle title="Availability calendar" subtitle="The single source of truth. Held and confirmed dates block everyone." />

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
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_300px]">
        <Card className="min-w-0 self-start overflow-hidden">
          {/* Grid: tablets and up */}
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
                {[...byResource.entries()].map(([id, res]) => (
                  <tr key={id}>
                    <td className="sticky left-0 z-10 border-t border-line bg-white px-3 py-1.5"><span className="font-medium text-ink">{res.name}</span><span className="ml-1 text-[10px] text-ink-soft">{res.capacity}</span></td>
                    {days.map((d) => {
                      const c = res.cells.get(d);
                      return (
                        <td key={d} className={cn("border-t border-l border-line/60 p-0.5", d === today ? "bg-sage-50" : "")}>
                          {c?.status ? <div title={`${c.label ?? LABEL[c.status]} · ${LABEL[c.status]}${c.expires_at ? ` · expires ${relativeFromNow(c.expires_at)}` : ""}`} className={cn("h-7 truncate rounded px-0.5 text-center text-[9px] leading-7", CELL[c.status])}>{c.status === "confirmed" ? "●" : c.status === "held" ? "H" : "?"}</div> : <div className="h-7" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Agenda: phones */}
          <ul className="divide-y divide-line/70 sm:hidden">
            {byDay.size === 0 ? <li className="px-4 py-6 text-center text-sm text-ink-soft">Every {view === "rooms" ? "room" : "space"} is free this month.</li> : null}
            {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, entries]) => (
              <li key={day} className="px-4 py-3">
                <p className="text-sm font-semibold">{formatDateIST(day, { weekday: "short", day: "numeric", month: "short" })}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {entries.map((e) => <li key={`${e.resource_id}`} className={cn("rounded-full px-2.5 py-1 text-xs", CELL[e.status!])}>{e.resource_name}{e.label ? ` · ${e.label}` : ""}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          {canHold ? (
            <Card>
              <CardHeader title="Hold a date" subtitle={`Soft holds expire after ${holdHours} hours unless confirmed`} />
              <div className="p-4"><HoldPanel spaces={(spaces.data ?? []) as { id: string; name: string }[]} rooms={(rooms.data ?? []) as { id: string; number: string }[]} holdHours={holdHours} /></div>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Active holds" subtitle="Soonest to expire first" />
            <ul className="divide-y divide-line/70">
              {(holds.data ?? []).length === 0 ? <li className="px-4 py-4 text-sm text-ink-soft">No active holds.</li> : null}
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
        </div>
      </div>
    </>
  );
}
