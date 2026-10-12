"use client";
import { buttonClass } from "@wiwaha/ui";
import { useActionState, useState } from "react";
import { RelativePartsEditor } from "@/components/parts-editor";
import { type RelativePart, scheduleRuleText, totalPercent } from "@/lib/payment-parts";
import { savePolicy, type PolicyFormState } from "../actions";

/** Prashanth's standard payment split, edited as parts instead of raw settings. */
export function PaymentScheduleForm({ initial, reminderOffsets, canEdit }: { initial: RelativePart[]; reminderOffsets: number[]; canEdit: boolean }) {
  const [parts, setParts] = useState<RelativePart[]>(initial);
  const [state, action, pending] = useActionState<PolicyFormState, FormData>(savePolicy, {});
  const used = new Set<string>();
  const milestones = parts.map((p, i) => {
    let key = p.milestone && !used.has(p.milestone) ? p.milestone : `part_${i + 1}`;
    while (used.has(key)) key = `${key}b`;
    used.add(key);
    return {
      milestone: key, label: p.label.trim(), percent_bps: Math.round(p.percent * 100), due: p.due,
      ...(p.due === "on_booking" ? {} : { days: p.days }), effect: p.effect,
    };
  });
  const ok = totalPercent(parts) === 100 && parts.every((p) => p.label.trim());
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="key" value="payments.schedule" />
      <input type="hidden" name="rule_text" value={scheduleRuleText(parts)} />
      <input type="hidden" name="value" value={JSON.stringify({ milestones, reminder_offsets_days: reminderOffsets })} />
      <p className="text-sm text-ink-soft">The standard split for new bookings. Each wedding can still be given its own parts on its Wedding Room page.</p>
      <RelativePartsEditor parts={parts} onChange={setParts} disabled={!canEdit} />
      <div className="rounded-xl bg-ivory-100 px-3 py-2 text-sm"><span className="text-xs text-ink-soft">What agents will read: </span>{scheduleRuleText(parts)}</div>
      {canEdit ? (
        <>
          <input name="change_note" placeholder="Why the change? (kept in the version history)" className="block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" />
          {state.error ? <p role="alert" className="rounded-lg bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">{state.error}</p> : null}
          {state.ok ? <p className="rounded-lg bg-sage-50 px-3 py-2 text-sm text-sage-800">{state.ok}</p> : null}
          <button disabled={pending || !ok} className={buttonClass("primary", "lg")}>{pending ? "Saving…" : "Save the standard split"}</button>
        </>
      ) : <p className="text-sm text-ink-soft">Only Prashanth can change the payment split.</p>}
    </form>
  );
}
