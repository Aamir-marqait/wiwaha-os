"use client";
import type { LeadStatus } from "@wiwaha/db";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { holdDateForLead, setHeardAbout, setLeadStatus } from "../actions";
import { STAGES, stageOf, type StageKey } from "@/lib/pipeline";

export const LOST_REASONS = [
  "Budget", "Date not available", "Chose another venue", "Location or distance", "Guest count or capacity",
  "Family decided otherwise", "Postponed or cancelled", "Stopped responding", "Other",
] as const;

/**
 * The stage as a row of buttons (D44): the chosen one lights up at once while it
 * saves. Lost asks why; Booked points to the booking form, which makes the wedding.
 */
export function StageButtons({ leadId, status, lostReason, booked }: { leadId: string; status: LeadStatus; lostReason?: string | null; booked: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<StageKey>(stageOf(status).key);
  const [asking, setAsking] = useState<"lost" | "booked" | null>(null);
  const [reason, setReason] = useState(lostReason ?? "");
  const [saved, setSaved] = useState(false);
  const save = (key: StageKey, r = "") => {
    const before = current;
    setCurrent(key); setAsking(null); setError(null); setSaved(false);
    start(async () => {
      const res = await setLeadStatus(leadId, (key === "won" ? "won" : key) as LeadStatus, r);
      if (res.error) { setCurrent(before); setError(res.error); } else setSaved(true);
    });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pipeline stage">
        {STAGES.map((s) => {
          const on = current === s.key;
          return (
            <button key={s.key} type="button" role="radio" aria-checked={on} disabled={pending && !on}
              onClick={() => {
                if (on) return;
                if (s.key === "lost") { setAsking("lost"); return; }
                if (s.key === "won" && !booked) { setAsking("booked"); document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
                save(s.key);
              }}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 transition-colors ${on ? (s.key === "lost" ? "bg-ink text-white ring-ink" : s.key === "won" ? "bg-gold-500 text-ink ring-gold-500" : "bg-sage-700 text-white ring-sage-700") : "bg-white text-ink ring-line hover:bg-ivory-100"}`}>
              {s.label}
            </button>
          );
        })}
        {pending ? <span className="self-center text-xs text-ink-soft">Saving…</span> : saved ? <span className="self-center text-xs text-sage-700">Saved</span> : null}
      </div>
      {asking === "booked" ? <p className="rounded-xl bg-gold-50 px-3 py-2 text-sm text-gold-700">Fill in <strong>Book the wedding</strong> below: it creates the wedding, its checklist and the couple&rsquo;s portal, and marks this lead Booked.</p> : null}
      {asking === "lost" ? (
        <div className="space-y-2 rounded-xl border border-line bg-ivory-50 p-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Why didn&rsquo;t they book?
            <select value={LOST_REASONS.includes(reason as (typeof LOST_REASONS)[number]) ? reason : reason ? "Other" : ""} onChange={(e) => setReason(e.target.value === "Other" ? "Other: " : e.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal">
              <option value="" disabled>Choose a reason</option>
              {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {reason.startsWith("Other") ? <input value={reason.replace(/^Other:\s*/, "")} onChange={(e) => setReason(`Other: ${e.target.value}`)} placeholder="In a few words" className="block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" /> : null}
          <div className="flex gap-2">
            <button type="button" disabled={!reason.trim() || reason === "Other: "} onClick={() => save("lost", reason)} className={buttonClass("primary", "sm")}>Mark as lost</button>
            <button type="button" onClick={() => setAsking(null)} className={buttonClass("ghost", "sm")}>Cancel</button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
    </div>
  );
}

/** "How did you hear about us", from the list in Settings → Lists. */
export function HeardAboutSelect({ leadId, value, options }: { leadId: string; value: string | null; options: string[] }) {
  const [v, setV] = useState(value ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const list = v && !options.includes(v) ? [v, ...options] : options;
  return (
    <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Heard about us
      <select value={v} disabled={pending} onChange={(e) => { const x = e.target.value; setV(x); start(async () => { const r = await setHeardAbout(leadId, x); setMsg(r.error ?? "Saved"); }); }} className="mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal">
        <option value="">Not asked yet</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {msg ? <span className="mt-1 block text-xs normal-case tracking-normal text-ink-soft">{msg}</span> : null}
    </label>
  );
}

export function HoldForm({ leadId, label, defaultDate, spaces }: { leadId: string; label: string; defaultDate: string | null; spaces: { id: string; name: string; capacity: number }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await holdDateForLead(leadId, String(f.get("space")), String(f.get("starts_on")), String(f.get("ends_on") || f.get("starts_on")), label);
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Booked. The dates are blocked on the calendar." });
        });
      }}
    >
      <select name="space" required className="block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm">
        {spaces.map((s) => <option key={s.id} value={s.id}>{s.name} (seats {s.capacity})</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input name="starts_on" type="date" required defaultValue={defaultDate ?? ""} className="h-10 rounded-xl border border-line bg-white px-3 text-sm" aria-label="From" />
        <input name="ends_on" type="date" defaultValue={defaultDate ?? ""} className="h-10 rounded-xl border border-line bg-white px-3 text-sm" aria-label="To" />
      </div>
      <button disabled={pending} className={buttonClass("primary", "sm", "w-full")}>{pending ? "Booking…" : "Book these dates"}</button>
      {msg ? <p className={`text-xs ${msg.ok ? "text-sage-700" : "text-burgundy-700"}`}>{msg.text}</p> : null}
    </form>
  );
}
