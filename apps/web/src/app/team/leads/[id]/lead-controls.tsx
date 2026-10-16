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

export const LOST_REASONS = [
  "Budget", "Date not available", "Chose another venue", "Location or distance", "Guest count or capacity",
  "Family decided otherwise", "Postponed or cancelled", "Stopped responding", "Other",
] as const;

export function StatusSelect({ leadId, status, lostReason }: { leadId: string; status: LeadStatus; lostReason?: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<LeadStatus>(status);
  const [reason, setReason] = useState(lostReason ?? "");
  const closing = value === "lost" || value === "no_response";
  const save = (v: LeadStatus, r: string) => start(async () => { const res = await setLeadStatus(leadId, v, r); setError(res.error ?? null); });
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Status</span>
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value as LeadStatus;
            setValue(v);
            // Lost and no-response wait for a reason; everything else saves at once.
            if (v !== "lost" && v !== "no_response") save(v, "");
            else if (v === "no_response" && !reason) setReason("Stopped responding");
          }}
          className="mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm"
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      {closing ? (
        <div className="space-y-2 rounded-xl border border-line bg-ivory-50 p-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Why didn't they book?
            <select value={LOST_REASONS.includes(reason as (typeof LOST_REASONS)[number]) ? reason : reason ? "Other" : ""} onChange={(e) => setReason(e.target.value === "Other" ? "Other: " : e.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal">
              <option value="" disabled>Choose a reason</option>
              {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {reason.startsWith("Other") ? <input value={reason.replace(/^Other:\s*/, "")} onChange={(e) => setReason(`Other: ${e.target.value}`)} placeholder="In a few words" className="block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" /> : null}
          <button type="button" disabled={pending || !reason.trim()} onClick={() => save(value, reason)} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : `Mark as ${value === "lost" ? "lost" : "no response"}`}</button>
        </div>
      ) : null}
      {error ? <span className="text-xs text-burgundy-700">{error}</span> : null}
    </div>
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
