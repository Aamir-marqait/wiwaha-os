"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDecorExtra, type ExtraInput } from "./extras-actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";
const EMPTY: ExtraInput = { kind: "rented", name: "", quantity: "1", unitCost: "", supplier: "", functionId: "", area: "", returnBy: "", stockItemId: "", notes: "" };

export function ExtraForm({ weddingId, functions, stock, areas }: { weddingId: string; functions: { id: string; name: string }[]; stock: { id: string; name: string }[]; areas: readonly string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<ExtraInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ExtraInput>(k: K, x: ExtraInput[K]) => setV((o) => ({ ...o, [k]: x }));
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>+ Rented or bought for this event</button>;
  return (
    <form className="space-y-3 rounded-xl border border-line bg-ivory-50 p-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addDecorExtra(weddingId, v); if (r.error) setError(r.error); else { setV(EMPTY); setError(null); setOpen(false); router.refresh(); } }); }}>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Rented or bought">
        {(["rented", "purchased"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={v.kind === k} onClick={() => set("kind", k)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${v.kind === k ? "bg-sage-700 text-white ring-sage-700" : "bg-white ring-line"}`}>{k === "rented" ? "Rented (goes back)" : "Bought (joins our stock)"}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>What *<input value={v.name} onChange={(e) => set("name", e.target.value)} required placeholder={v.kind === "rented" ? "e.g. Crystal chandeliers" : "e.g. Brass uruli, large"} className={field} /></label>
        {v.kind === "purchased" && stock.length ? (
          <label className={`${label} sm:col-span-2`}>More of a piece we own?<select value={v.stockItemId} onChange={(e) => { set("stockItemId", e.target.value); const it = stock.find((s) => s.id === e.target.value); if (it && !v.name) set("name", it.name); }} className={field}><option value="">No, a new piece</option>{stock.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        ) : null}
        <label className={label}>Quantity<input value={v.quantity} onChange={(e) => set("quantity", e.target.value)} inputMode="numeric" className={field} /></label>
        <label className={label}>Cost per piece (₹) *<input value={v.unitCost} onChange={(e) => set("unitCost", e.target.value)} inputMode="decimal" required className={field} /></label>
        <label className={label}>{v.kind === "rented" ? "Rented from" : "Bought from"}<input value={v.supplier} onChange={(e) => set("supplier", e.target.value)} className={field} /></label>
        {v.kind === "rented" ? <label className={label}>Goes back by<input type="date" value={v.returnBy} onChange={(e) => set("returnBy", e.target.value)} className={field} /></label> : null}
        <label className={label}>Function<select value={v.functionId} onChange={(e) => set("functionId", e.target.value)} className={field}><option value="">All / not specific</option>{functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className={label}>Area<select value={v.area} onChange={(e) => set("area", e.target.value)} className={field}><option value="">Not specific</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
        <label className={`${label} sm:col-span-2`}>Notes<input value={v.notes} onChange={(e) => set("notes", e.target.value)} className={field} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : "Add"}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
        {error ? <span role="alert" className="text-sm text-burgundy-700">{error}</span> : null}
      </div>
    </form>
  );
}
