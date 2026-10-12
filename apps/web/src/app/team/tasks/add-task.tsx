"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { createTask } from "./actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";
const ROLE_LABEL: Record<string, string> = { owner: "Owner", sales: "Sales team", event_manager: "Event managers", staff: "Estate team", accounts: "Accounts" };

export function AddTask({ people, weddings, today }: { people: { id: string; name: string; role: string }[]; weddings: { id: string; title: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button onClick={() => setOpen(true)} className={buttonClass("primary", "md")}>+ Add task</button>;
  return (
    <form className="space-y-3 rounded-2xl border border-line bg-white p-4" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const d = new FormData(form);
      const s = (k: string) => String(d.get(k) ?? "");
      const who = s("who");
      start(async () => {
        const r = await createTask({ title: s("title"), description: s("description"), ownerId: who.startsWith("role:") ? "" : who, ownerRole: who.startsWith("role:") ? who.slice(5) : "", date: s("date"), time: s("time"), priority: s("priority"), proof: s("proof"), weddingId: s("wedding") });
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Task added." });
        if (!r.error) form.reset();
      });
    }}>
      <label className={label}>Task<input name="title" required className={field} placeholder="e.g. Repaint the Pavilion gate" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`${label} col-span-2 sm:col-span-1`}>Who
          <select name="who" className={field} required>
            <optgroup label="A person">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
            <optgroup label="Anyone in a team">{Object.entries(ROLE_LABEL).map(([r, l]) => <option key={r} value={`role:${r}`}>{l}</option>)}</optgroup>
          </select>
        </label>
        <label className={`${label} col-span-2 sm:col-span-1`}>Wedding (optional)<select name="wedding" className={field}><option value="">None</option>{weddings.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
        <label className={label}>Due<input type="date" name="date" defaultValue={today} required className={field} /></label>
        <label className={label}>Time<input type="time" name="time" defaultValue="18:00" className={field} /></label>
        <label className={label}>Priority<select name="priority" defaultValue="normal" className={field}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label className={label}>Proof<select name="proof" defaultValue="tick" className={field}><option value="tick">Just a tick</option><option value="photo">Photo</option><option value="file">File</option><option value="none">None</option></select></label>
      </div>
      <label className={label}>Details<textarea name="description" rows={2} className="mt-1 block w-full rounded-xl border border-line px-3 py-2 text-sm normal-case tracking-normal" /></label>
      <div className="flex items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Adding…" : "Add task"}</button>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className={buttonClass("ghost", "md")}>Close</button>
        {msg ? <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-sage-700" : "text-sm text-burgundy-700"}>{msg.text}</span> : null}
      </div>
    </form>
  );
}
