import { Badge, Card, CardHeader } from "@wiwaha/ui";
import { formatDateIST, rupees } from "@wiwaha/db";
import type { createClient } from "@/lib/supabase/server";
import { InspectionForm } from "./inspection-form";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Phase 4 panels: run-of-show, rooms, handover inspection and invoices. */
export async function OperationsPanels({ supabase, weddingId, role, eventEnded }: { supabase: Supa; weddingId: string; role: string; eventEnded: boolean }) {
  const money = role === "owner" || role === "accounts";
  const [ros, rooms, inspection, invoices] = await Promise.all([
    supabase.from("run_of_show_items").select("id, starts_at, ends_at, title, owner_label, fn:event_functions(name, date)").eq("wedding_id", weddingId).order("starts_at"),
    supabase.from("room_allocations").select("id, guest_name, party_size, check_in, check_out, complimentary, status, needs_pickup, room:rooms(number)").eq("wedding_id", weddingId).neq("status", "cancelled").order("check_in"),
    supabase.from("inspections").select("*").eq("wedding_id", weddingId).maybeSingle(),
    money ? supabase.from("invoices").select("id, number, kind, status, total_paise, balance_paise").eq("wedding_id", weddingId).order("created_at") : Promise.resolve({ data: [] as { id: string; number: string; kind: string; status: string; total_paise: number; balance_paise: number }[] }),
  ]);
  const byFn = new Map<string, { date: string; items: { id: string; starts_at: string; ends_at: string | null; title: string; owner_label: string | null }[] }>();
  for (const r of ros.data ?? []) {
    const fn = (Array.isArray(r.fn) ? r.fn[0] : r.fn) as { name: string; date: string } | null;
    const k = fn?.name ?? "Function";
    const e = byFn.get(k) ?? { date: fn?.date ?? "", items: [] };
    e.items.push({ id: r.id as string, starts_at: String(r.starts_at).slice(0, 5), ends_at: r.ends_at ? String(r.ends_at).slice(0, 5) : null, title: r.title as string, owner_label: r.owner_label as string | null });
    byFn.set(k, e);
  }
  const allocated = (rooms.data ?? []).filter((r) => r.room);
  return (
    <>
      <Card>
        <CardHeader title="Run-of-show" subtitle="Drafted by the Planner from templates; shared after the event manager approves" />
        {byFn.size === 0 ? <p className="px-5 py-4 text-sm text-ink-soft">Appears once the brief is reviewed and functions have start times.</p> : (
          <div className="space-y-3 px-4 py-3 sm:px-5">
            {[...byFn.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date)).map(([name, v]) => (
              <div key={name}>
                <p className="text-sm font-medium">{name} · {v.date ? formatDateIST(v.date, { weekday: "short", day: "numeric", month: "short" }) : ""}</p>
                <ol className="mt-1 space-y-0.5 text-sm">{v.items.map((i) => <li key={i.id} className="flex gap-2"><span className="w-24 shrink-0 tabular-nums text-ink-soft">{i.starts_at}{i.ends_at ? `–${i.ends_at}` : ""}</span><span className="min-w-0">{i.title}{i.owner_label ? <span className="text-xs text-ink-soft"> · {i.owner_label}</span> : null}</span></li>)}</ol>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Rooms" subtitle={`${allocated.length} of ${(rooms.data ?? []).length} guests placed · ${(rooms.data ?? []).filter((r) => r.complimentary).length} complimentary`} />
        <ul className="divide-y divide-line/70">
          {(rooms.data ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">The couple adds their rooming list in the portal.</li> : null}
          {(rooms.data ?? []).map((r) => {
            const room = (Array.isArray(r.room) ? r.room[0] : r.room) as { number: string } | null;
            return (
              <li key={r.id as string} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                <span className="min-w-0">{r.guest_name as string} ({r.party_size as number}) <span className="text-xs text-ink-soft">· {formatDateIST(r.check_in as string, { day: "numeric", month: "short" })}→{formatDateIST(r.check_out as string, { day: "numeric", month: "short" })}{r.needs_pickup ? " · pickup" : ""}</span></span>
                <span className="flex shrink-0 gap-1">{room ? <Badge tone="solid">Room {room.number}</Badge> : <Badge tone="burgundy">unplaced</Badge>}{r.complimentary ? <Badge>comp</Badge> : null}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {eventEnded ? (
        <Card>
          <CardHeader title="Handover inspection" subtitle="Photos and damage check; Finance proposes the security-deposit decision to Prashanth" />
          <div className="px-4 py-3 sm:px-5">
            {inspection.data ? (
              <div className="space-y-1 text-sm">
                <p>Inspected {formatDateIST(inspection.data.inspected_at as string)} · damage {rupees(Number(inspection.data.damage_total_paise))}</p>
                {inspection.data.deposit_decision ? <p>Deposit: <strong>{String(inspection.data.deposit_decision).replace("_", " ")}</strong>{inspection.data.deposit_refund_paise !== null ? ` · refund ${rupees(Number(inspection.data.deposit_refund_paise))}` : ""}</p> : <p className="text-ink-soft">Deposit decision waiting for Prashanth.</p>}
                <ul className="mt-2 text-xs text-ink-soft">{((inspection.data.items ?? []) as { area: string; ok: boolean; note: string | null }[]).map((i) => <li key={i.area}>{i.ok ? "✓" : "✗"} {i.area}{i.note ? `: ${i.note}` : ""}</li>)}</ul>
              </div>
            ) : role !== "accounts" && role !== "sales" ? <InspectionForm weddingId={weddingId} /> : <p className="text-sm text-ink-soft">Not inspected yet.</p>}
          </div>
        </Card>
      ) : null}

      {money && (invoices.data ?? []).length ? (
        <Card>
          <CardHeader title="Invoices" />
          <ul className="divide-y divide-line/70">
            {(invoices.data ?? []).map((i) => <li key={i.id} className="flex justify-between gap-2 px-4 py-2.5 text-sm sm:px-5"><span>{i.number} <span className="text-xs uppercase text-ink-soft">{i.kind}</span></span><span>{rupees(Number(i.total_paise))} · <Badge tone={i.status === "issued" ? "solid" : "gold"}>{i.status.replace("_", " ")}</Badge></span></li>)}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
