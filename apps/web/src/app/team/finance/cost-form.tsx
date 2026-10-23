"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { COST_LABELS } from "@/lib/costs";
import { addCost } from "./actions";

/** Quick notes for the costs entered most often. */
const HINTS: Record<string, string[]> = {
  marketing: ["Meta ads", "Google ads", "WedMeGood listing", "Photo shoot", "Printing"],
  utilities: ["Electricity bill", "Water tanker"],
  staff: ["Salaries", "Extra helpers"],
};
const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

/** Any money going out: ads, salaries, diesel, or a wedding's own costs. */
export function CostForm({ weddings }: { weddings: { id: string; title: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [category, setCategory] = useState("marketing");
  const [note, setNote] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      start(async () => {
        const r = await addCost({ weddingId: String(f.get("wedding")), category, rupeesAmount: Number(String(f.get("amount")).replace(/[,₹\s]/g, "")), description: note, on: String(f.get("on") ?? "") });
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.ok ?? "Saved." });
        if (!r.error) { form.reset(); setNote(""); }
      });
    }}>
      <fieldset>
        <legend className={label}>What for</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {Object.entries(COST_LABELS).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={category === k} onClick={() => setCategory(k)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${category === k ? "bg-sage-700 text-white ring-sage-700" : "bg-white ring-line"}`}>{l}</button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Amount (₹) *<input name="amount" inputMode="decimal" required placeholder="e.g. 15,000" className={`${field} text-base font-semibold`} /></label>
        <label className={label}>Date<input type="date" name="on" className={field} /></label>
        <label className={`${label} col-span-2`}>Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What it was" className={field} /></label>
        {HINTS[category] ? <div className="col-span-2 -mt-1 flex flex-wrap gap-1">{HINTS[category].map((h) => <button key={h} type="button" onClick={() => setNote(h)} className="rounded-full bg-ivory-200 px-2.5 py-1 text-xs">{h}</button>)}</div> : null}
        <label className={`${label} col-span-2`}>For a wedding?<select name="wedding" className={field}><option value="">No, the estate in general</option>{weddings.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Saving…" : "Add cost"}</button>
        {msg ? <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-sage-700" : "text-burgundy-700"}`}>{msg.text}</span> : null}
      </div>
    </form>
  );
}
