"use client";
import { cn } from "@wiwaha/ui";
import { Plus, Trash2 } from "lucide-react";
import { DUE_KINDS, type DatedPart, type DueKind, EFFECT_LABELS, EFFECTS, type Effect, type RelativePart, totalPercent } from "@/lib/payment-parts";

const input = "h-9 w-full rounded-lg border border-line bg-white px-2 text-sm outline-none focus:border-sage-500 disabled:bg-ivory-100";
const DUE_LABELS: Record<DueKind, string> = { on_booking: "On booking", days_after_booking: "Days after booking", days_before_event: "Days before the event" };

function Total({ parts, totalRupees }: { parts: { percent: number }[]; totalRupees?: number | null }) {
  const t = totalPercent(parts);
  return (
    <p className={cn("text-sm", t === 100 ? "text-sage-800" : "text-burgundy-700")} role="status">
      Adds up to <strong>{t}%</strong>{t === 100 ? "" : " (must be 100%)"}
      {totalRupees ? <span className="text-ink-soft"> · contract ₹{totalRupees.toLocaleString("en-IN")}</span> : null}
    </p>
  );
}

const amount = (percent: number, totalRupees?: number | null) =>
  totalRupees && Number.isFinite(percent) ? ` ≈ ₹${Math.round((totalRupees * percent) / 100).toLocaleString("en-IN")}` : "";

/** Prashanth's standard split, or a split before the wedding has dates. */
export function RelativePartsEditor({ parts, onChange, disabled, totalRupees }: { parts: RelativePart[]; onChange: (p: RelativePart[]) => void; disabled?: boolean; totalRupees?: number | null }) {
  const set = (i: number, patch: Partial<RelativePart>) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      {parts.map((p, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line bg-ivory-50 p-3 sm:grid-cols-[1fr_90px]">
          <label className="text-xs text-ink-soft">Name the family sees<input className={input} disabled={disabled} value={p.label} onChange={(e) => set(i, { label: e.target.value })} /></label>
          <label className="text-xs text-ink-soft">%<input className={input} disabled={disabled} type="number" min={0} max={100} step="0.5" value={Number.isFinite(p.percent) ? p.percent : ""} onChange={(e) => set(i, { percent: e.target.valueAsNumber })} /></label>
          <label className="text-xs text-ink-soft">When it&rsquo;s due
            <select className={input} disabled={disabled} value={p.due} onChange={(e) => set(i, { due: e.target.value as DueKind })}>{DUE_KINDS.map((d) => <option key={d} value={d}>{DUE_LABELS[d]}</option>)}</select>
          </label>
          <label className="text-xs text-ink-soft">Days<input className={input} disabled={disabled || p.due === "on_booking"} type="number" min={0} value={p.due === "on_booking" ? "" : p.days} onChange={(e) => set(i, { days: Math.max(0, Math.round(e.target.valueAsNumber || 0)) })} /></label>
          <label className="text-xs text-ink-soft sm:col-span-2">What paying it unlocks
            <select className={input} disabled={disabled} value={p.effect} onChange={(e) => set(i, { effect: e.target.value as Effect })}>{EFFECTS.map((x) => <option key={x} value={x}>{EFFECT_LABELS[x]}</option>)}</select>
          </label>
          {!disabled ? (
            <div className="flex items-center justify-between sm:col-span-2">
              <span className="text-xs text-ink-soft">{amount(p.percent, totalRupees)}</span>
              {parts.length > 1 ? <button type="button" onClick={() => onChange(parts.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs text-burgundy-700 hover:underline"><Trash2 className="size-3.5" aria-hidden /> Remove part</button> : null}
            </div>
          ) : null}
        </div>
      ))}
      {!disabled ? <button type="button" onClick={() => onChange([...parts, { label: "Next payment", percent: 0, due: "days_before_event", days: 60, effect: "none" }])} className="inline-flex items-center gap-1 text-sm text-sage-700 hover:underline"><Plus className="size-4" aria-hidden /> Add a part</button> : null}
      <Total parts={parts} totalRupees={totalRupees} />
    </div>
  );
}

/** A booked wedding's own parts. Paid parts are locked. */
export function DatedPartsEditor({ parts, onChange, totalRupees }: { parts: DatedPart[]; onChange: (p: DatedPart[]) => void; totalRupees?: number | null }) {
  const set = (i: number, patch: Partial<DatedPart>) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      {parts.map((p, i) => (
        <div key={p.id ?? `new-${i}`} className={cn("grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_90px]", p.paid ? "bg-ivory-100" : "bg-ivory-50")}>
          <label className="text-xs text-ink-soft">Name{p.paid ? " (paid, locked)" : ""}<input className={input} disabled={p.paid} value={p.label} onChange={(e) => set(i, { label: e.target.value })} /></label>
          <label className="text-xs text-ink-soft">%<input className={input} disabled={p.paid} type="number" min={0} max={100} step="0.5" value={Number.isFinite(p.percent) ? p.percent : ""} onChange={(e) => set(i, { percent: e.target.valueAsNumber })} /></label>
          <label className="text-xs text-ink-soft">Due on<input className={input} disabled={p.paid} type="date" value={p.dueOn} onChange={(e) => set(i, { dueOn: e.target.value })} /></label>
          <label className="text-xs text-ink-soft">Unlocks
            <select className={input} disabled={p.paid} value={p.effect} onChange={(e) => set(i, { effect: e.target.value as Effect })}>{EFFECTS.map((x) => <option key={x} value={x}>{EFFECT_LABELS[x]}</option>)}</select>
          </label>
          <div className="flex items-center justify-between sm:col-span-2">
            <span className="text-xs text-ink-soft">{amount(p.percent, totalRupees)}</span>
            {!p.paid && parts.length > 1 ? <button type="button" onClick={() => onChange(parts.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs text-burgundy-700 hover:underline"><Trash2 className="size-3.5" aria-hidden /> Remove part</button> : null}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...parts, { label: "Next payment", percent: 0, dueOn: parts[parts.length - 1]?.dueOn ?? "", effect: "none" }])} className="inline-flex items-center gap-1 text-sm text-sage-700 hover:underline"><Plus className="size-4" aria-hidden /> Add a part</button>
      <Total parts={parts} totalRupees={totalRupees} />
    </div>
  );
}
