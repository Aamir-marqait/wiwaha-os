import { Badge, Card, CardHeader } from "@wiwaha/ui";
import { formatDateIST, formatDateTimeIST } from "@wiwaha/db";
import { ActionButton } from "@/components/action-button";
import { env } from "@/lib/env";
import type { createClient } from "@/lib/supabase/server";
import { setGuestRequestStatus } from "./actions";
import { GuestShare } from "./guest-forms";

type Supa = Awaited<ReturnType<typeof createClient>>;
const TONE: Record<string, "gold" | "sage" | "solid" | "neutral"> = { new: "gold", confirmed: "sage", done: "solid", cancelled: "neutral" };

/** The guest page for this wedding, and what guests have asked for. */
export async function GuestPanel({ supabase, w, canEdit }: { supabase: Supa; w: { id: string; title: string; guest_token: string; guest_welcome: string | null }; canEdit: boolean }) {
  const { data: reqs } = await supabase.from("guest_requests").select("id, option_name, guest_name, phone_e164, room, quantity, wanted_on, notes, status, created_at").eq("wedding_id", w.id).order("created_at", { ascending: false }).limit(100);
  const url = `${env.appUrl()}/g/${w.guest_token}`;
  return (
    <Card>
      <CardHeader title="Guest page" subtitle="For everyone staying: welcome, itinerary, the estate, and add-on services they can request (Lists → Extras → Guests can book)." />
      <div className="px-4 py-3 sm:px-5"><GuestShare weddingId={w.id} url={url} title={w.title} welcome={w.guest_welcome} canEdit={canEdit} /></div>
      <ul className="divide-y divide-line/70 border-t border-line/70">
        {(reqs ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-ink-soft">No guest requests yet.</li> : null}
        {(reqs ?? []).map((r) => (
          <li key={r.id as string} className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.option_name as string}{Number(r.quantity) > 1 ? ` × ${r.quantity as number}` : ""}</p>
              <p className="text-xs text-ink-soft">{r.guest_name as string}{r.room ? ` · room ${r.room as string}` : ""}{r.phone_e164 ? ` · ${r.phone_e164 as string}` : ""}{r.wanted_on ? ` · ${formatDateIST(r.wanted_on as string, { weekday: "short", day: "numeric", month: "short" })}` : ""} · {formatDateTimeIST(r.created_at as string)}</p>
              {r.notes ? <p className="mt-1 text-xs italic">&ldquo;{r.notes as string}&rdquo;</p> : null}
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <Badge tone={TONE[r.status as string] ?? "neutral"}>{r.status as string}</Badge>
              {r.status === "new" ? <ActionButton action={setGuestRequestStatus.bind(null, w.id, r.id as string, "confirmed")}>Confirm</ActionButton> : null}
              {r.status === "confirmed" ? <ActionButton action={setGuestRequestStatus.bind(null, w.id, r.id as string, "done")} variant="primary">Done</ActionButton> : null}
              {r.status === "new" || r.status === "confirmed" ? <ActionButton action={setGuestRequestStatus.bind(null, w.id, r.id as string, "cancelled")} variant="ghost">Cancel</ActionButton> : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
