"use client";
import { buttonClass } from "@wiwaha/ui";
import { useActionState } from "react";
import { placeHold } from "./actions";

export function HoldPanel({ spaces, rooms, holdHours }: { spaces: { id: string; name: string }[]; rooms: { id: string; number: string }[]; holdHours: number }) {
  const [state, action, pending] = useActionState(placeHold, {});
  const input = "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm";
  return (
    <form action={action} className="space-y-3">
      <select name="resource" className={input} required>
        <optgroup label="Spaces">{spaces.map((s) => <option key={s.id} value={`space:${s.id}`}>{s.name}</option>)}</optgroup>
        <optgroup label="Rooms">{rooms.map((r) => <option key={r.id} value={`room:${r.id}`}>Room {r.number}</option>)}</optgroup>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-soft">From<input type="date" name="starts_on" required className={input} /></label>
        <label className="text-xs text-ink-soft">To<input type="date" name="ends_on" className={input} /></label>
      </div>
      <input name="label" placeholder="Who is it for?" className={input} />
      <label className="block text-xs text-ink-soft">Hours (policy default {holdHours})<input name="hours" type="number" min={1} max={720} placeholder={String(holdHours)} className={input} /></label>
      <button disabled={pending} className={buttonClass("gold", "md", "w-full")}>{pending ? "Holding…" : "Place soft hold"}</button>
      {state.error ? <p role="alert" className="text-sm text-burgundy-700">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-sage-700">{state.ok}</p> : null}
    </form>
  );
}
