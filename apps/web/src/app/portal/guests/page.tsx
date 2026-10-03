import { Card } from "@wiwaha/ui";
import { formatDateIST } from "@wiwaha/db";
import { ActionButton } from "@/components/action-button";
import { removeGuest, submitRoomingList } from "../actions";
import { GuestForm } from "../_ui/forms";
import { loadPortal, stageOf } from "../_ui/load";
import { PortalShell } from "../_ui/shell";
import { StageGate } from "../_ui/stage-gate";

export const metadata = { title: "Guests & rooms" };

export default async function GuestsPage() {
  const { viewer, supabase, t, wedding, me } = await loadPortal();
  const w = wedding!;
  const first = viewer.profile.full_name.split(" ")[0] ?? "";
  const stage = await stageOf(supabase, w.id as string, "guests_rooms");
  if (!stage?.started_at) return <PortalShell t={t} wedding={w} first={first} active="guests"><StageGate t={t} stage={stage} /></PortalShell>;
  const { data: guests } = await supabase.from("room_allocations").select("id, guest_name, party_size, check_in, check_out, needs_pickup, pickup_from, pickup_at, status, room:rooms(name)").eq("wedding_id", w.id).neq("status", "cancelled").order("check_in");
  const editable = !!me?.can_edit_brief;
  return (
    <PortalShell t={t} wedding={w} first={first} active="guests">
      <p className="text-sm text-ink-soft">Your booking includes {w.complimentary_rooms as number} complimentary rooms. Add who&rsquo;s staying and who needs an airport pickup; we&rsquo;ll assign rooms and arrange cars.</p>
      <Card>
        <ul className="divide-y divide-line/70">
          {(guests ?? []).length === 0 ? <li className="px-4 py-4 text-sm text-ink-soft">{t.nothing_yet}</li> : null}
          {(guests ?? []).map((g) => {
            const room = (Array.isArray(g.room) ? g.room[0] : g.room) as { name: string } | null;
            return (
              <li key={g.id as string} className="flex items-start justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{g.guest_name as string} <span className="text-xs text-ink-soft">· {g.party_size as number}</span></p>
                  <p className="text-xs text-ink-soft">{formatDateIST(g.check_in as string)} → {formatDateIST(g.check_out as string)}{room ? ` · ${room.name}` : ""}{g.needs_pickup ? ` · pickup ${g.pickup_from ?? ""}` : ""} · {g.status as string}</p>
                </div>
                {editable && g.status === "planned" ? <ActionButton action={removeGuest.bind(null, g.id as string)} variant="ghost" confirm="Remove this guest?">Remove</ActionButton> : null}
              </li>
            );
          })}
        </ul>
      </Card>
      {editable ? (
        <>
          <Card className="p-4"><h2 className="mb-3 font-serif text-xl font-semibold">{t.add_guest}</h2><GuestForm weddingId={w.id as string} eventStart={w.event_start as string} eventEnd={w.event_end as string} label={t.add_guest} /></Card>
          {(guests ?? []).length ? <ActionButton action={submitRoomingList.bind(null, w.id as string)} variant="primary" size="md">{t.submit_rooming}</ActionButton> : null}
        </>
      ) : null}
    </PortalShell>
  );
}
