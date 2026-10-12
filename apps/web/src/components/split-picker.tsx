"use client";
import { useState } from "react";
import { type RelativePart, scheduleRuleText } from "@/lib/payment-parts";
import { RelativePartsEditor } from "./parts-editor";

/**
 * On a booking form: shows the standard split; Prashanth can change it for
 * this wedding. Writes the parts as JSON to a hidden "parts" field only when changed.
 */
export function SplitPicker({ standard, canChange }: { standard: RelativePart[]; canChange: boolean }) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState(standard);
  return (
    <div className="rounded-xl border border-line bg-ivory-50 p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Payment parts</p>
      {!open ? (
        <>
          <p className="mt-1">{scheduleRuleText(standard)}</p>
          {canChange ? <button type="button" onClick={() => setOpen(true)} className="mt-1 text-sm text-sage-700 hover:underline">Change for this wedding</button> : <p className="mt-1 text-xs text-ink-soft">Prashanth can change the split for this wedding afterwards.</p>}
        </>
      ) : (
        <div className="mt-2 space-y-2">
          <input type="hidden" name="parts" value={JSON.stringify(parts)} />
          <RelativePartsEditor parts={parts} onChange={setParts} />
          <button type="button" onClick={() => { setParts(standard); setOpen(false); }} className="text-xs text-ink-soft hover:underline">Use the standard split</button>
        </div>
      )}
    </div>
  );
}
