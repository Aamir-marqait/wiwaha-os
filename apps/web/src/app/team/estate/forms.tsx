"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { recordReading, setStock } from "./actions";

/** − 24 + : saved as you tap. */
export function StockForm({ itemId, quantity }: { itemId: string; quantity: number }) {
  const [n, setN] = useState(quantity);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const change = (x: number) => { const v = Math.max(0, x); setN(v); start(async () => setError((await setStock(itemId, v)).error ?? null)); };
  const btn = "grid size-9 place-items-center rounded-lg bg-ivory-200 text-lg font-semibold text-sage-800 hover:bg-ivory-100 disabled:opacity-40";
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" aria-label="One less" disabled={n <= 0} onClick={() => change(n - 1)} className={btn}>−</button>
      <input aria-label="Quantity" value={String(n)} inputMode="numeric" onChange={(e) => setN(Number(e.target.value.replace(/\D/g, "")) || 0)} onBlur={() => change(n)} className="h-9 w-14 rounded-lg border border-line text-center text-sm font-semibold" />
      <button type="button" aria-label="One more" onClick={() => change(n + 1)} className={btn}>+</button>
      {error ? <span role="alert" className="text-xs text-burgundy-700">{error}</span> : null}
    </span>
  );
}

export function ReadingForm({ weddings }: { weddings: { id: string; title: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="grid grid-cols-2 gap-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      start(async () => { const r = await recordReading({ kind: String(f.get("kind")), reading: Number(f.get("reading")), weddingId: String(f.get("wedding") ?? ""), notes: String(f.get("notes") ?? "") }); setMsg(r.error ?? r.ok ?? null); if (!r.error) form.reset(); });
    }}>
      <label className="text-xs uppercase tracking-wide text-ink-soft">Meter<select name="kind" className="mt-1 block h-10 w-full rounded-xl border border-line px-2 text-sm"><option value="diesel_litres">Diesel (litres)</option><option value="electricity_kwh">Electricity (kWh)</option><option value="water_kl">Water (kL)</option><option value="lpg_kg">LPG (kg)</option></select></label>
      <label className="text-xs uppercase tracking-wide text-ink-soft">Reading<input name="reading" inputMode="decimal" required className="mt-1 block h-10 w-full rounded-xl border border-line px-3 text-sm" /></label>
      <label className="col-span-2 text-xs uppercase tracking-wide text-ink-soft">Event (optional)<select name="wedding" className="mt-1 block h-10 w-full rounded-xl border border-line px-2 text-sm"><option value="">No event</option>{weddings.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
      <input name="notes" placeholder="Notes" className="col-span-2 h-10 rounded-xl border border-line px-3 text-sm" />
      <button disabled={pending} className={buttonClass("primary", "md", "col-span-2")}>{pending ? "Saving…" : "Record reading"}</button>
      {msg ? <p className="col-span-2 text-sm text-ink-soft">{msg}</p> : null}
    </form>
  );
}
