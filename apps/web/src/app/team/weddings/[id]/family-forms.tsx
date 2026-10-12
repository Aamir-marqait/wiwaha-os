"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { addFamilyMember, deleteFunction, saveFunction, type FunctionInput } from "./actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";
const TYPES = ["haldi", "mehendi", "sangeet", "wedding", "reception", "engagement", "cocktail", "pooja", "other"];

export interface FunctionRow extends FunctionInput { id: string; spaceName: string | null }

function FunctionForm({ weddingId, initial, id, spaces, defaultDate, onDone }: { weddingId: string; initial: FunctionInput | null; id: string | null; spaces: { id: string; name: string }[]; defaultDate: string; onDone: () => void }) {
  const [f, setF] = useState<FunctionInput>(initial ?? { type: "wedding", name: "Wedding", date: defaultDate, start: "", end: "", guests: "", spaceId: "", rituals: "" });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FunctionInput, v: string) => setF((o) => ({ ...o, [k]: v }));
  return (
    <form className="space-y-3 px-4 py-3 sm:px-5" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveFunction(weddingId, id, f); if (r.error) setError(r.error); else onDone(); }); }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={label}>Type<select value={f.type} onChange={(e) => { const t = e.target.value; const label = (x: string) => x[0]!.toUpperCase() + x.slice(1); setF((o) => ({ ...o, type: t, name: !o.name || o.name === label(o.type) ? label(t) : o.name })); }} className={field}>{TYPES.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}</select></label>
        <label className={label}>Name<input value={f.name} onChange={(e) => set("name", e.target.value)} required className={field} /></label>
        <label className={label}>Date<input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} required className={field} /></label>
        <label className={label}>Guests<input inputMode="numeric" value={f.guests} onChange={(e) => set("guests", e.target.value.replace(/\D/g, ""))} className={field} /></label>
        <label className={label}>Starts<input type="time" value={f.start} onChange={(e) => set("start", e.target.value)} className={field} /></label>
        <label className={label}>Ends<input type="time" value={f.end} onChange={(e) => set("end", e.target.value)} className={field} /></label>
        <label className={`${label} col-span-2`}>Space<select value={f.spaceId} onChange={(e) => set("spaceId", e.target.value)} className={field}><option value="">Not decided</option>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className={`${label} col-span-2 sm:col-span-4`}>Rituals that affect setup<input value={f.rituals} onChange={(e) => set("rituals", e.target.value)} placeholder="e.g. sacred fire, baraat" className={field} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : id ? "Save" : "Add function"}</button>
        <button type="button" onClick={onDone} className={buttonClass("ghost", "sm")}>Cancel</button>
        {id ? <button type="button" disabled={pending} onClick={() => { if (window.confirm("Delete this function?")) start(async () => { const r = await deleteFunction(weddingId, id); if (r.error) setError(r.error); else onDone(); }); }} className="text-xs text-burgundy-700 underline">Delete</button> : null}
        {error ? <span role="alert" className="text-xs text-burgundy-700">{error}</span> : null}
      </div>
    </form>
  );
}

/** The wedding's functions: list, add, edit, delete. */
export function FunctionsEditor({ weddingId, rows, spaces, defaultDate, canEdit }: { weddingId: string; rows: FunctionRow[]; spaces: { id: string; name: string }[]; defaultDate: string; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <ul className="divide-y divide-line/70">
        {rows.length === 0 && editing !== "new" ? <li className="px-5 py-4 text-sm text-ink-soft">No functions yet. Add them here, or the couple adds them in their portal brief.</li> : null}
        {rows.map((r) => editing === r.id ? (
          <li key={r.id}><FunctionForm weddingId={weddingId} id={r.id} initial={r} spaces={spaces} defaultDate={defaultDate} onDone={() => setEditing(null)} /></li>
        ) : (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div>
              <p className="text-sm font-medium">{r.name}</p>
              <p className="text-xs text-ink-soft">{new Date(`${r.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}{r.start ? ` · ${r.start}` : ""}{r.spaceName ? ` · ${r.spaceName}` : ""}{r.rituals ? ` · ${r.rituals}` : ""}</p>
            </div>
            <span className="flex items-center gap-3">
              <span className="text-sm text-ink-soft">{r.guests || "—"} guests</span>
              {canEdit ? <button onClick={() => setEditing(r.id)} className={buttonClass("secondary", "sm")}>Edit</button> : null}
            </span>
          </li>
        ))}
        {editing === "new" ? <li><FunctionForm weddingId={weddingId} id={null} initial={null} spaces={spaces} defaultDate={defaultDate} onDone={() => setEditing(null)} /></li> : null}
      </ul>
      {canEdit && editing !== "new" ? <div className="border-t border-line/70 px-4 py-3 sm:px-5"><button onClick={() => setEditing("new")} className={buttonClass("secondary", "sm")}>+ Add function</button></div> : null}
    </>
  );
}

/** Add a family member, optionally with their own portal login. */
export function FamilyForm({ weddingId }: { weddingId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>+ Add family member</button>;
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const d = new FormData(form);
      start(async () => {
        const r = await addFamilyMember(weddingId, { name: String(d.get("name") ?? ""), phone: String(d.get("phone") ?? ""), email: String(d.get("email") ?? ""), relation: String(d.get("relation")), keyContact: d.get("key") === "on", portal: d.get("portal") === "on" });
        setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Added." });
        if (!r.error) form.reset();
      });
    }}>
      <div className="grid grid-cols-2 gap-2">
        <label className={`${label} col-span-2`}>Name<input name="name" required className={field} /></label>
        <label className={label}>Phone<input name="phone" inputMode="tel" placeholder="+91…" className={field} /></label>
        <label className={label}>Relation<select name="relation" className={field} defaultValue="parent"><option value="bride">Bride</option><option value="groom">Groom</option><option value="parent">Parent</option><option value="sibling">Sibling</option><option value="relative">Relative</option><option value="planner">Planner</option><option value="friend">Friend</option><option value="other">Other</option></select></label>
        <label className={`${label} col-span-2`}>Email<input name="email" type="email" className={field} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="key" /> Key contact (added to the family WhatsApp group)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="portal" /> Give them a portal login (invite by email)</label>
      <div className="flex items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Adding…" : "Add"}</button>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className={buttonClass("ghost", "sm")}>Close</button>
        {msg ? <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs text-sage-700" : "text-xs text-burgundy-700"}>{msg.text}</span> : null}
      </div>
    </form>
  );
}
