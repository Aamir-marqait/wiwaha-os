"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { addCost } from "./actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm";
export function CostForm({ weddings }: { weddings: { id: string; title: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="grid grid-cols-2 gap-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      start(async () => { const r = await addCost({ weddingId: String(f.get("wedding")), category: String(f.get("category")), rupeesAmount: Number(String(f.get("amount")).replace(/[,₹\s]/g, "")), description: String(f.get("description") ?? ""), on: String(f.get("on") ?? "") }); setMsg(r.error ?? r.ok ?? null); if (!r.error) form.reset(); });
    }}>
      <label className="col-span-2 text-xs uppercase tracking-wide text-ink-soft">Wedding<select name="wedding" className={field}><option value="">Estate (no wedding)</option>{weddings.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
      <label className="text-xs uppercase tracking-wide text-ink-soft">Category<select name="category" className={field}>{["fnb", "staff", "decor", "vendor", "utilities", "diesel", "consumables", "breakage", "marketing", "other"].map((c) => <option key={c} value={c}>{c === "fnb" ? "Food & beverage" : c}</option>)}</select></label>
      <label className="text-xs uppercase tracking-wide text-ink-soft">Amount (₹)<input name="amount" inputMode="decimal" required className={field} /></label>
      <label className="text-xs uppercase tracking-wide text-ink-soft">Date<input type="date" name="on" className={field} /></label>
      <label className="text-xs uppercase tracking-wide text-ink-soft">Note<input name="description" className={field} /></label>
      <button disabled={pending} className={buttonClass("primary", "md", "col-span-2")}>{pending ? "Saving…" : "Add cost"}</button>
      {msg ? <p className="col-span-2 text-sm text-ink-soft">{msg}</p> : null}
    </form>
  );
}
