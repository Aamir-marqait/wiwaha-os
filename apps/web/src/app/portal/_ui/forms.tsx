"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { addGuest, approveMenu, inviteMember, postMessage, saveBrief, setPermission, shortlistMoodboard, snoozeStage, type BriefFunction, type Perm } from "../actions";

const input = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";
type R = { error?: string; ok?: string };

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<R>, after?: () => void) => start(async () => {
    const r = await fn();
    setMsg(r.error ? { ok: false, text: r.error } : r.ok ? { ok: true, text: r.ok } : null);
    if (!r.error) after?.();
  });
  const note = msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-sage-700" : "text-sm text-burgundy-700"}>{msg.text}</p> : null;
  return { pending, run, note };
}

// ---------------------------------------------------------------------------
const TYPES = ["haldi", "mehendi", "sangeet", "wedding", "reception", "engagement", "cocktail", "pooja", "other"];
const blank = (date: string): BriefFunction => ({ type: "wedding", name: "", date, start_time: "", end_time: "", guest_count: "", rituals: "" });

export function BriefForm({ weddingId, initialFunctions, initialAnswers, eventStart, editable, labels }: {
  weddingId: string; initialFunctions: BriefFunction[]; initialAnswers: Record<string, string | boolean>; eventStart: string; editable: boolean;
  labels: { save: string; saving: string; submit: string };
}) {
  const [fns, setFns] = useState<BriefFunction[]>(initialFunctions.length ? initialFunctions : [blank(eventStart)]);
  const [a, setA] = useState<Record<string, string | boolean>>(initialAnswers);
  const { pending, run, note } = useAction();
  const set = (i: number, k: keyof BriefFunction, v: string) => setFns((xs) => xs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const text = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  return (
    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
      <fieldset disabled={!editable || pending} className="space-y-3">
        <legend className="font-serif text-xl font-semibold">Your functions</legend>
        {fns.map((f, i) => (
          <div key={f.id ?? `new-${i}`} className="space-y-2 rounded-2xl border border-line bg-white p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Type<select value={f.type} onChange={(e) => set(i, "type", e.target.value)} className={input}>{TYPES.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}</select></label>
              <label className={label}>Name<input value={f.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="e.g. Haldi" className={input} /></label>
              <label className={label}>Date<input type="date" value={f.date} onChange={(e) => set(i, "date", e.target.value)} className={input} /></label>
              <label className={label}>Guests<input inputMode="numeric" value={f.guest_count} onChange={(e) => set(i, "guest_count", e.target.value.replace(/\D/g, ""))} className={input} /></label>
              <label className={label}>Starts<input type="time" value={f.start_time} onChange={(e) => set(i, "start_time", e.target.value)} className={input} /></label>
              <label className={label}>Ends<input type="time" value={f.end_time} onChange={(e) => set(i, "end_time", e.target.value)} className={input} /></label>
            </div>
            <label className={label}>Rituals or special moments<input value={f.rituals} onChange={(e) => set(i, "rituals", e.target.value)} placeholder="e.g. sacred fire, baraat" className={input} /></label>
            {fns.length > 1 ? <button type="button" onClick={() => setFns((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-burgundy-700 underline">Remove</button> : null}
          </div>
        ))}
        <button type="button" onClick={() => setFns((xs) => [...xs, blank(xs.at(-1)?.date ?? eventStart)])} className={buttonClass("secondary", "sm")}>+ Add a function</button>
      </fieldset>

      <fieldset disabled={!editable || pending} className="space-y-3">
        <legend className="font-serif text-xl font-semibold">Food</legend>
        <label className={label}>Cuisines you&rsquo;d love<input value={text("cuisines")} onChange={(e) => setA({ ...a, cuisines: e.target.value })} placeholder="South Indian, North Indian…" className={input} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.veg_only === true} onChange={(e) => setA({ ...a, veg_only: e.target.checked })} /> Vegetarian only</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.outside_caterer === true} onChange={(e) => setA({ ...a, outside_caterer: e.target.checked })} /> We&rsquo;ll bring our own caterer</label>
        {a.outside_caterer === true ? <label className={label}>Caterer&rsquo;s name<input value={text("outside_caterer_name")} onChange={(e) => setA({ ...a, outside_caterer_name: e.target.value })} className={input} /></label> : null}
      </fieldset>

      <fieldset disabled={!editable || pending} className="space-y-3">
        <legend className="font-serif text-xl font-semibold">Everything else</legend>
        <label className={label}>Rooms you&rsquo;ll need<input inputMode="numeric" value={text("guest_rooms_needed")} onChange={(e) => setA({ ...a, guest_rooms_needed: e.target.value.replace(/\D/g, "") })} className={input} /></label>
        <label className={label}>Special requests<textarea value={text("special_requests")} onChange={(e) => setA({ ...a, special_requests: e.target.value })} rows={4} className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" /></label>
      </fieldset>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run(() => saveBrief(weddingId, fns, a, false))} className={buttonClass("secondary", "md")}>{pending ? labels.saving : labels.save}</button>
          <button type="button" disabled={pending} onClick={() => run(() => saveBrief(weddingId, fns, a, true))} className={buttonClass("primary", "md")}>{labels.submit}</button>
        </div>
      ) : null}
      {note}
    </form>
  );
}

// ---------------------------------------------------------------------------
export function MenuApprove({ menuId, label: text }: { menuId: string; label: string }) {
  const { pending, run, note } = useAction();
  const [n, setN] = useState("");
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input value={n} onChange={(e) => setN(e.target.value)} placeholder="Any note for the chef (optional)" className="h-10 min-w-0 flex-1 rounded-xl border border-line px-3 text-sm" />
      <button disabled={pending} onClick={() => run(() => approveMenu(menuId, n))} className={buttonClass("primary", "md")}>{pending ? "…" : text}</button>
      {note}
    </div>
  );
}

export function MoodboardActions({ id, shortlisted, labels }: { id: string; shortlisted: boolean; labels: { shortlist: string; not_for_us: string } }) {
  const { pending, run, note } = useAction();
  const [fb, setFb] = useState("");
  return (
    <div className="space-y-2">
      <input value={fb} onChange={(e) => setFb(e.target.value)} placeholder="What do you love, or want changed?" className="h-10 w-full rounded-xl border border-line px-3 text-sm" />
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => run(() => shortlistMoodboard(id, true, fb))} className={buttonClass(shortlisted ? "secondary" : "primary", "sm")}>{labels.shortlist}</button>
        <button disabled={pending} onClick={() => run(() => shortlistMoodboard(id, false, fb))} className={buttonClass("ghost", "sm")}>{labels.not_for_us}</button>
      </div>
      {note}
    </div>
  );
}

export function GuestForm({ weddingId, eventStart, eventEnd, label: text }: { weddingId: string; eventStart: string; eventEnd: string; label: string }) {
  const { pending, run, note } = useAction();
  const [pickup, setPickup] = useState(false);
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      const s = (k: string) => String(f.get(k) ?? "");
      run(() => addGuest(weddingId, { name: s("name"), phone: s("phone"), partySize: Number(s("party")) || 1, checkIn: s("in"), checkOut: s("out"), pickup, pickupFrom: s("from"), pickupAt: s("at"), notes: s("notes") }), () => { form.reset(); setPickup(false); });
    }}>
      <div className="grid grid-cols-2 gap-2">
        <label className={`${label} col-span-2`}>Guest name<input name="name" required className={input} /></label>
        <label className={label}>Phone<input name="phone" inputMode="tel" placeholder="+91…" className={input} /></label>
        <label className={label}>People<input name="party" inputMode="numeric" defaultValue="2" className={input} /></label>
        <label className={label}>Check-in<input type="date" name="in" defaultValue={eventStart} required className={input} /></label>
        <label className={label}>Check-out<input type="date" name="out" defaultValue={eventEnd} required className={input} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> Needs airport pickup</label>
      {pickup ? (
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>From<select name="from" className={input}><option>BLR T1</option><option>BLR T2</option><option>Bengaluru city</option></select></label>
          <label className={label}>Landing (IST)<input type="datetime-local" name="at" className={input} /></label>
        </div>
      ) : null}
      <label className={label}>Notes<input name="notes" placeholder="Dietary needs, accessibility…" className={input} /></label>
      <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "…" : text}</button>
      {note}
    </form>
  );
}

export function InviteForm({ weddingId }: { weddingId: string }) {
  const { pending, run, note } = useAction();
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      run(() => inviteMember(weddingId, { name: String(f.get("name")), email: String(f.get("email")), role: String(f.get("role")) }), () => form.reset());
    }}>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Name<input name="name" required className={input} /></label>
        <label className={label}>Relation<select name="role" className={input}><option value="parent">Parent</option><option value="family">Family</option><option value="planner">Planner</option><option value="couple">Partner</option></select></label>
        <label className={`${label} col-span-2`}>Email<input name="email" type="email" required className={input} /></label>
      </div>
      <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "…" : "Invite"}</button>
      {note}
    </form>
  );
}

export function PermToggle({ memberId, perm, value, disabled }: { memberId: string; perm: Perm; value: boolean; disabled: boolean }) {
  const { pending, run, note } = useAction();
  return (
    <span className="inline-flex items-center">
      <input type="checkbox" aria-label={perm.replace(/_/g, " ")} defaultChecked={value} disabled={disabled || pending} onChange={(e) => run(() => setPermission(memberId, perm, e.target.checked))} />
      {note}
    </span>
  );
}

export function ChatBox({ weddingId, label: text }: { weddingId: string; label: string }) {
  const { pending, run, note } = useAction();
  return (
    <form className="flex gap-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      run(() => postMessage(weddingId, String(new FormData(form).get("body") ?? "")), () => form.reset());
    }}>
      <input name="body" autoComplete="off" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-[15px]" placeholder="…" />
      <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "…" : text}</button>
      {note}
    </form>
  );
}

export function SnoozeForm({ stageId }: { stageId: string }) {
  const { pending, run, note } = useAction();
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs text-sage-700 underline">Not yet? Snooze</button>;
  return (
    <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      run(() => snoozeStage(stageId, String(f.get("until")), String(f.get("reason") ?? "")), () => setOpen(false));
    }}>
      <label className={label}>Until<input type="date" name="until" required className={input} /></label>
      <label className={`${label} min-w-40 flex-1`}>Why (optional)<input name="reason" className={input} /></label>
      <button disabled={pending} className={buttonClass("secondary", "sm")}>Snooze</button>
      {note}
    </form>
  );
}
