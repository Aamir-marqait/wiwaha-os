"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { assignOptions, saveGroupLink, sendOptions } from "./actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm";

/** Tick options from the list and send them to the couple to choose from. */
export function OptionsPicker({ weddingId, vertical, options, functions }: { weddingId: string; vertical: "entertainment" | "extras"; options: { id: string; name: string; category: string }[]; functions: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [fn, setFn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "sm")}>Assign {vertical === "extras" ? "add-on services" : "entertainment"}</button>;
  if (!options.length) return <p className="text-sm text-ink-soft">No {vertical} options yet. Add them in <a className="text-sage-700 underline" href={`/team/catalogue/${vertical}`}>Lists → {vertical === "extras" ? "Extras" : "Entertainment"}</a>.</p>;
  return (
    <div className="space-y-3">
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line bg-ivory-50 p-2">
        {options.map((o) => (
          <li key={o.id}>
            <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
              <input type="checkbox" className="accent-sage-600" checked={picked.has(o.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(o.id); else n.delete(o.id); setPicked(n); }} />
              <span className="min-w-0 flex-1">{o.name}</span>
              <span className="text-xs capitalize text-ink-soft">{o.category.replace(/_/g, " ")}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">For which function
          <select value={fn} onChange={(e) => setFn(e.target.value)} className={field}><option value="">Whole wedding</option>{functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        </label>
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} className={field} /></label>
      </div>
      {error ? <p role="alert" className="text-sm text-burgundy-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || !picked.size} className={buttonClass("primary", "sm")}
          onClick={() => start(async () => { const r = await assignOptions(weddingId, vertical, [...picked], fn || null, note); if (r.error) setError(r.error); else { setOpen(false); setPicked(new Set()); setNote(""); } })}>
          {pending ? "Saving…" : `Assign ${picked.size || ""} to the wedding`}
        </button>
        <button type="button" disabled={pending || !picked.size} className={buttonClass("secondary", "sm")}
          onClick={() => start(async () => { const r = await sendOptions(weddingId, vertical, [...picked], fn || null, note); if (r.error) setError(r.error); else { setOpen(false); setPicked(new Set()); setNote(""); } })}>
          Show the couple to choose
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
      </div>
    </div>
  );
}

/** Save the family WhatsApp group's invite link. */
export function GroupLinkForm({ weddingId, current }: { weddingId: string; current: string | null }) {
  const [v, setV] = useState(current ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveGroupLink(weddingId, v); setMsg(r.error ?? "Saved."); }); }}>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="https://chat.whatsapp.com/…" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-sm" />
      <button disabled={pending} className={buttonClass("secondary", "sm")}>{pending ? "Saving…" : "Save link"}</button>
      {msg ? <p className="w-full text-xs text-ink-soft" role="status">{msg}</p> : null}
    </form>
  );
}
