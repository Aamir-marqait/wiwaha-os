"use client";
import type { LeadStatus } from "@wiwaha/db";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { holdDateForLead, setLeadStatus } from "../actions";

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" }, { value: "contacted", label: "Contacted" }, { value: "visit_booked", label: "Visit booked" },
  { value: "visited", label: "Visited" }, { value: "follow_up_done", label: "Followed up" }, { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Booked" }, { value: "lost", label: "Lost" }, { value: "no_response", label: "No response" },
];

export function StatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Status</span>
      <select
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value as LeadStatus;
          start(async () => {
            const r = await setLeadStatus(leadId, v);
            setError(r.error ?? null);
          });
        }}
        className="mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm"
      >
        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      {error ? <span className="text-xs text-burgundy-700">{error}</span> : null}
    </label>
  );
}

export function HoldForm({ leadId, label, defaultDate, spaces, holdHours }: { leadId: string; label: string; defaultDate: string | null; spaces: { id: string; name: string; capacity: number }[]; holdHours: number }) {
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
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Held for ${holdHours} hours. It releases automatically if not confirmed.` });
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
      <button disabled={pending} className={buttonClass("gold", "sm", "w-full")}>{pending ? "Holding…" : `Place a ${holdHours}-hour soft hold`}</button>
      {msg ? <p className={`text-xs ${msg.ok ? "text-sage-700" : "text-burgundy-700"}`}>{msg.text}</p> : null}
    </form>
  );
}
