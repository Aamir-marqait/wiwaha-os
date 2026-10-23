"use client";
import { buttonClass } from "@wiwaha/ui";
import { useMemo, useState, useTransition } from "react";
import { PhotoField } from "@/components/photo-field";
import { CONDITION_LABELS, CONDITIONS, DECOR_CATEGORIES, pretty } from "@/lib/decor";
import { assignDecor, type DecorInput, saveDecorItem, setAssignmentStatus, setDecorQuantity, applyTemplate } from "./actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

/** Add or edit a piece: photos (camera on a phone), name, quantity, condition, where it's kept. */
export function ItemForm({ id, initial, onDone }: { id: string | null; initial?: Partial<DecorInput>; onDone?: () => void }) {
  const [v, setV] = useState<DecorInput>({ name: "", category: "props", photos: "", quantity: "1", condition: "good", location: "", notes: "", active: true, unitCost: "", useCost: "", ...initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof DecorInput>(k: K, x: DecorInput[K]) => setV((o) => ({ ...o, [k]: x }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveDecorItem(id, v); if (r.error) setError(r.error); else { setError(null); if (!id) setV({ ...v, name: "", photos: "", notes: "" }); onDone?.(); } }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <PhotoField label="Photos" value={v.photos} multiple onChange={(x) => set("photos", x)} />
        <label className={label}>Name *<input value={v.name} onChange={(e) => set("name", e.target.value)} required placeholder="e.g. Brass urli, large" className={field} /></label>
        <label className={label}>Type<select value={v.category} onChange={(e) => set("category", e.target.value)} className={field}>{DECOR_CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</select></label>
        <div className={label}>How many we own *<Stepper value={Number(v.quantity) || 0} onChange={(n) => set("quantity", String(n))} /></div>
        <label className={label}>Condition<select value={v.condition} onChange={(e) => set("condition", e.target.value)} className={field}>{CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}</select></label>
        <label className={label}>Stored at<input value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Décor store, rack 3" className={field} /></label>
        <label className={label}>What one cost us (₹)<input value={v.unitCost ?? ""} onChange={(e) => set("unitCost", e.target.value)} inputMode="decimal" placeholder="Optional" className={field} /></label>
        <label className={label}>Cost per event use (₹)<input value={v.useCost ?? ""} onChange={(e) => set("useCost", e.target.value)} inputMode="decimal" placeholder="Wear, cleaning, transport" className={field} /></label>
        <label className={`${label} sm:col-span-2`}>Notes<input value={v.notes} onChange={(e) => set("notes", e.target.value)} className={field} /></label>
        {id ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} /> In use (untick to retire it)</label> : null}
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Saving…" : id ? "Save changes" : "Add to stock"}</button>
        {onDone ? <button type="button" onClick={onDone} className={buttonClass("ghost", "md")}>Cancel</button> : null}
        {error ? <span role="alert" className="text-sm text-burgundy-700">{error}</span> : null}
      </div>
    </form>
  );
}

/** − 12 + : big buttons, and the number can still be typed. */
function Stepper({ value, onChange, min = 0, label: aria = "Quantity" }: { value: number; onChange: (n: number) => void; min?: number; label?: string }) {
  const btn = "grid size-10 shrink-0 place-items-center rounded-xl bg-ivory-200 text-lg font-semibold text-sage-800 hover:bg-ivory-100 disabled:opacity-40";
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <button type="button" aria-label="One less" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={btn}>−</button>
      <input aria-label={aria} value={String(value)} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); onChange(Number.isFinite(n) ? n : min); }} inputMode="numeric" className="h-10 w-16 rounded-xl border border-line bg-white text-center text-base font-semibold" />
      <button type="button" aria-label="One more" onClick={() => onChange(value + 1)} className={btn}>+</button>
    </span>
  );
}

/** The count on a stock card, saved as you tap. */
export function QuantityStepper({ id, initial, canEdit }: { id: string; initial: number; canEdit: boolean }) {
  const [n, setN] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!canEdit) return <p className="text-2xl font-semibold">{initial}</p>;
  const change = (x: number) => { setN(x); start(async () => setError((await setDecorQuantity(id, x)).error ?? null)); };
  return <span><Stepper value={n} onChange={change} />{error ? <span role="alert" className="block text-xs text-burgundy-700">{error}</span> : null}</span>;
}

export interface EventOption { id: string; title: string; dates: string; functions: { id: string; name: string }[] }

/** Assign pieces to an event, a function (optional) and the area they'll dress. */
export function AssignForm({ itemId, max, events, areas, onDone }: { itemId: string; max: number; events: EventOption[]; areas: readonly string[]; onDone?: () => void }) {
  const [weddingId, setWeddingId] = useState(events[0]?.id ?? "");
  const [functionId, setFunctionId] = useState("");
  const [area, setArea] = useState(areas[0] ?? "");
  const [custom, setCustom] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fns = useMemo(() => events.find((e) => e.id === weddingId)?.functions ?? [], [events, weddingId]);
  if (!events.length) return <p className="text-sm text-ink-soft">No upcoming events to assign to.</p>;
  return (
    <form className="space-y-2 rounded-xl border border-line bg-ivory-50 p-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await assignDecor({ itemId, weddingId, functionId, area: area === "Other" ? custom : area, quantity, notes }); if (r.error) setError(r.error); else onDone?.(); }); }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>Event<select value={weddingId} onChange={(e) => { setWeddingId(e.target.value); setFunctionId(""); }} className={field}>{events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.dates}</option>)}</select></label>
        <label className={label}>Function<select value={functionId} onChange={(e) => setFunctionId(e.target.value)} className={field}><option value="">Whole event</option>{fns.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className={label}>Area<select value={area} onChange={(e) => setArea(e.target.value)} className={field}>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
        {area === "Other" ? <label className={label}>Which area<input value={custom} onChange={(e) => setCustom(e.target.value)} className={field} /></label> : null}
        <div className={label}>How many (of {max})<Stepper value={Number(quantity) || 1} min={1} onChange={(n) => setQuantity(String(Math.min(n, Math.max(1, max))))} /></div>
        <label className={label}>Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></label>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Assigning…" : "Assign"}</button>
        {onDone ? <button type="button" onClick={onDone} className={buttonClass("ghost", "sm")}>Cancel</button> : null}
        {error ? <span role="alert" className="text-sm text-burgundy-700">{error}</span> : null}
      </div>
    </form>
  );
}

/** One card's Edit / Assign toggles. */
export function ItemActions({ id, initial, max, events, areas, canEdit }: { id: string; initial: DecorInput; max: number; events: EventOption[]; areas: readonly string[]; canEdit: boolean }) {
  const [mode, setMode] = useState<"none" | "edit" | "assign">("none");
  if (!canEdit) return null;
  return (
    <div className="space-y-2">
      {mode === "none" ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("assign")} className={buttonClass("primary", "sm")}>Assign to event</button>
          <button type="button" onClick={() => setMode("edit")} className={buttonClass("secondary", "sm")}>Edit</button>
        </div>
      ) : mode === "edit" ? <ItemForm id={id} initial={initial} onDone={() => setMode("none")} /> : <AssignForm itemId={id} max={max} events={events} areas={areas} onDone={() => setMode("none")} />}
    </div>
  );
}

/** Returned to the store: record the condition it came back in. */
export function ReturnForm({ id }: { id: string }) {
  const [cond, setCond] = useState("good");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-1">
      <select value={cond} onChange={(e) => setCond(e.target.value)} aria-label="Condition on return" className="h-8 rounded-lg border border-line bg-white px-1 text-xs">{CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}</select>
      <button type="button" disabled={pending} onClick={() => start(async () => setError((await setAssignmentStatus(id, "returned", cond)).error ?? null))} className={buttonClass("secondary", "sm")}>{pending ? "…" : "Returned"}</button>
      {error ? <span className="text-xs text-burgundy-700">{error}</span> : null}
    </span>
  );
}

/** "Use for an event": the template becomes a moodboard on that function. */
export function UseTemplate({ templateId, events }: { templateId: string; events: EventOption[] }) {
  const [open, setOpen] = useState(false);
  const [weddingId, setWeddingId] = useState(events[0]?.id ?? "");
  const [functionId, setFunctionId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fns = events.find((e) => e.id === weddingId)?.functions ?? [];
  if (!events.length) return null;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>Use for an event</button>;
  return (
    <form className="space-y-2 rounded-xl border border-line bg-ivory-50 p-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await applyTemplate(templateId, weddingId, functionId); setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Added to that event's moodboards." }); }); }}>
      <label className={label}>Event<select value={weddingId} onChange={(e) => { setWeddingId(e.target.value); setFunctionId(""); }} className={field}>{events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.dates}</option>)}</select></label>
      <label className={label}>Function<select value={functionId} onChange={(e) => setFunctionId(e.target.value)} required className={field}><option value="">Choose…</option>{fns.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Adding…" : "Add moodboard"}</button>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className={buttonClass("ghost", "sm")}>Close</button>
        {msg ? <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-sage-700" : "text-burgundy-700"}`}>{msg.text}</span> : null}
      </div>
      {fns.length === 0 ? <p className="text-xs text-ink-soft">This event has no functions yet.</p> : null}
    </form>
  );
}
