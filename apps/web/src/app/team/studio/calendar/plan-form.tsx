"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPlan, type NewPlan } from "../actions";

const field = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

/** Step 1: how many posts, for how long. The strategist fills each slot; the mix and pillars are optional. */
export function PlanForm({ pillars, nextMonday }: { pillars: string[]; nextMonday: string }) {
  const router = useRouter();
  const [v, setV] = useState<NewPlan>({ start: nextMonday, weeks: "1", postsPerWeek: "4", reel: "40", carousel: "40", single: "20", pillars: pillars.slice(0, 5), notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = Number(v.postsPerWeek) * Number(v.weeks);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createPlan(v); if (r.error) setError(r.error); else { setError(null); router.refresh(); } }); }}>
      <div className="grid grid-cols-3 gap-3">
        <label className={label}>Starts<input type="date" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} className={field} /></label>
        <label className={label}>For<select value={v.weeks} onChange={(e) => setV({ ...v, weeks: e.target.value })} className={field}><option value="1">1 week</option><option value="4">4 weeks</option></select></label>
        <label className={label}>Posts a week<select value={v.postsPerWeek} onChange={(e) => setV({ ...v, postsPerWeek: e.target.value })} className={field}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      <label className={label}>Anything to mention? (festivals, launches)<textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="e.g. Ugadi on the 30th; open-house visits this Sunday" className={field} /></label>
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm text-sage-700">Fine-tune the mix and pillars</summary>
        <fieldset className="mt-3">
          <legend className={label}>Mix (%)</legend>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {([["reel", "Reels"], ["carousel", "Carousels"], ["single", "Single posts"]] as const).map(([k, l]) => <label key={k} className="text-sm">{l}<input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={field} /></label>)}
          </div>
        </fieldset>
        <fieldset className="mt-3">
          <legend className={label}>Pillars</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {pillars.map((p) => { const on = v.pillars.includes(p); return <button key={p} type="button" aria-pressed={on} onClick={() => setV({ ...v, pillars: on ? v.pillars.filter((x) => x !== p) : [...v.pillars, p] })} className={`rounded-full px-3 py-1 text-sm ring-1 ${on ? "bg-sage-700 text-white ring-sage-700" : "bg-white ring-line"}`}>{p}</button>; })}
          </div>
        </fieldset>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Planning…" : `Plan ${total} post${total === 1 ? "" : "s"}`}</button>
        {error ? <span role="alert" className="text-sm text-burgundy-700">{error}</span> : null}
      </div>
    </form>
  );
}
