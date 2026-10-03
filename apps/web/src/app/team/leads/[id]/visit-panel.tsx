"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { VoiceNote } from "@/components/voice-note";
import { bookVisitAction, completeVisitAction, setVisitStatus } from "../../visits/actions";

export interface SlotOption { startsAt: string; executiveId: string; label: string; executive: string }
export interface VisitItem { id: string; label: string; status: string; executive: string | null; attendees: string | null; brief: string | null; recap: string | null; followUp: string }

export function BookVisit({ leadId, slots }: { leadId: string; slots: SlotOption[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (slots.length === 0) return <p className="text-sm text-ink-soft">No free visiting slots in the next week. Check executive availability in Settings.</p>;
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const slot = slots[Number(f.get("slot"))]!;
      start(async () => {
        const r = await bookVisitAction(leadId, slot.startsAt, slot.executiveId, String(f.get("attendees") ?? ""), Number(f.get("count")) || null);
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Visit booked. Visit Host is briefing the executive and drafting the family's confirmation." });
      });
    }}>
      <select name="slot" className="block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm">
        {slots.map((s, i) => <option key={`${s.startsAt}-${s.executiveId}`} value={i}>{s.label} · {s.executive}</option>)}
      </select>
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <input name="attendees" placeholder="Who is coming?" className="h-10 rounded-xl border border-line bg-white px-3 text-sm" />
        <input name="count" type="number" min={1} placeholder="How many" className="h-10 rounded-xl border border-line bg-white px-3 text-sm" />
      </div>
      <button disabled={pending} className={buttonClass("primary", "sm", "w-full")}>{pending ? "Booking…" : "Book site visit"}</button>
      {msg ? <p className={`text-xs ${msg.ok ? "text-sage-700" : "text-burgundy-700"}`}>{msg.text}</p> : null}
    </form>
  );
}

export function VisitCard({ leadId, v, checklist }: { leadId: string; v: VisitItem; checklist: { key: string; label: string }[] }) {
  const [note, setNote] = useState("");
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <li className="rounded-xl bg-ivory-100 px-3 py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{v.label}</p>
          <p className="text-xs text-ink-soft">{v.status.replace(/_/g, " ")}{v.executive ? ` · host ${v.executive}` : ""}{v.attendees ? ` · ${v.attendees}` : ""}</p>
          <p className="text-xs text-ink-soft">Follow-up call: {v.followUp}</p>
        </div>
        {v.status === "scheduled" ? <button onClick={() => setOpen(!open)} className={buttonClass("secondary", "sm")}>{open ? "Close" : "Finish visit"}</button> : null}
      </div>
      {v.brief ? <details className="mt-2"><summary className="cursor-pointer text-xs text-sage-700">Pre-visit brief</summary><p className="mt-1 whitespace-pre-line text-xs">{v.brief}</p></details> : null}
      {v.recap ? <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs"><span className="font-medium">Recap:</span> {v.recap}</p> : null}
      {open ? (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <fieldset className="grid grid-cols-2 gap-1">
            {checklist.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!ticks[c.key]} onChange={(e) => setTicks({ ...ticks, [c.key]: e.target.checked })} />{c.label}</label>
            ))}
          </fieldset>
          <VoiceNote value={note} onChange={setNote} />
          <div className="flex flex-wrap gap-2">
            <button disabled={pending} onClick={() => start(async () => { const r = await completeVisitAction(v.id, leadId, note, ticks); setErr(r.error ?? null); if (!r.error) setOpen(false); })} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : "Save visit and recap"}</button>
            <button disabled={pending} onClick={() => start(async () => { const r = await setVisitStatus(v.id, leadId, "no_show"); setErr(r.error ?? null); })} className={buttonClass("ghost", "sm")}>No-show</button>
          </div>
          {err ? <p className="text-xs text-burgundy-700">{err}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
