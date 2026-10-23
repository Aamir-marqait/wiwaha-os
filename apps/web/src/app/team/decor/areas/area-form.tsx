"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type AreaInput, saveArea } from "@/app/team/media/actions";

const KINDS: [string, string][] = [["entrance", "Entrance"], ["pathway", "Pathway"], ["lawn", "Lawn"], ["hall", "Hall"], ["poolside", "Poolside"], ["amphitheatre", "Amphitheatre"], ["courtyard", "Courtyard"], ["rooms", "Rooms"], ["other", "Other"]];
const FUNCTIONS: [string, string][] = [["haldi", "Haldi"], ["mehendi", "Mehendi"], ["sangeet", "Sangeet"], ["wedding", "Wedding / muhurtham"], ["reception", "Reception"], ["engagement", "Engagement"], ["cocktail", "Cocktail"], ["pooja", "Pooja"], ["other", "Other"]];
const field = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

/** Name an area, say what it's like (the Design assistant reads this), and which functions it usually hosts. */
export function AreaForm({ id, initial, spaces, onDone }: { id: string | null; initial?: Partial<AreaInput>; spaces: { id: string; name: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<AreaInput>({ name: "", kind: "other", description: "", suits: [], spaceId: null, sort: "100", active: true, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveArea(id, v); if (r.error) setError(r.error); else { setError(null); if (!id && r.id) router.push(`/team/decor/areas/${r.id}`); else { router.refresh(); onDone?.(); } } }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Name *<input value={v.name} required onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Main lawn, Lobby pathway" className={field} /></label>
        <label className={label}>Kind<select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })} className={field}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className={`${label} sm:col-span-2`}>What it's like<textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Floors, walls, pillars, light. The Design assistant reads this." className={field} /></label>
        <label className={label}>Bookable space it belongs to<select value={v.spaceId ?? ""} onChange={(e) => setV({ ...v, spaceId: e.target.value || null })} className={field}><option value="">Not booked on its own</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className={label}>Order<input value={v.sort} inputMode="numeric" onChange={(e) => setV({ ...v, sort: e.target.value })} className={field} /></label>
      </div>
      <fieldset>
        <legend className={label}>Usually hosts</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {FUNCTIONS.map(([k, l]) => {
            const on = v.suits.includes(k);
            return <button key={k} type="button" aria-pressed={on} onClick={() => setV({ ...v, suits: on ? v.suits.filter((x) => x !== k) : [...v.suits, k] })} className={`rounded-full px-3 py-1 text-sm ring-1 ${on ? "bg-sage-700 text-white ring-sage-700" : "bg-white text-ink ring-line"}`}>{l}</button>;
          })}
        </div>
      </fieldset>
      {id ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> In use</label> : null}
      <div className="flex items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Saving…" : id ? "Save" : "Add space"}</button>
        {onDone ? <button type="button" onClick={onDone} className={buttonClass("ghost", "md")}>Cancel</button> : null}
        {error ? <span role="alert" className="text-sm text-burgundy-700">{error}</span> : null}
      </div>
    </form>
  );
}
