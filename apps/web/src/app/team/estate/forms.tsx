"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { recordReading, setStock } from "./actions";

export function StockForm({ itemId, quantity }: { itemId: string; quantity: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const q = Number(new FormData(e.currentTarget).get("q")); start(async () => { const r = await setStock(itemId, q); setMsg(r.error ?? r.ok ?? null); }); }}>
      <input name="q" type="number" min={0} defaultValue={quantity} aria-label="Quantity" className="h-8 w-20 rounded-lg border border-line px-2 text-sm" />
      <button disabled={pending} className={buttonClass("secondary", "sm")}>{pending ? "…" : "Update"}</button>
      {msg ? <span className="text-xs text-ink-soft">{msg}</span> : null}
    </form>
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
