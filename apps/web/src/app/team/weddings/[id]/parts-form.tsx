"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { DatedPartsEditor } from "@/components/parts-editor";
import { type DatedPart, totalPercent } from "@/lib/payment-parts";
import { setWeddingParts } from "./actions";

/** Prashanth changes this wedding's payment parts (e.g. a 25% advance, or four parts). */
export function WeddingPartsForm({ weddingId, initial, totalRupees }: { weddingId: string; initial: DatedPart[]; totalRupees: number | null }) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState(initial);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm text-sage-700 hover:underline">Change payment parts</button>;
  return (
    <div className="space-y-3">
      <DatedPartsEditor parts={parts} onChange={setParts} totalRupees={totalRupees} />
      {msg?.error ? <p role="alert" className="rounded-lg bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">{msg.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || totalPercent(parts) !== 100} className={buttonClass("primary", "sm")}
          onClick={() => start(async () => { const r = await setWeddingParts(weddingId, parts); setMsg(r.error ? r : { ok: "Saved." }); if (!r.error) setOpen(false); })}>
          {pending ? "Saving…" : "Save parts"}
        </button>
        <button type="button" onClick={() => { setParts(initial); setOpen(false); setMsg(null); }} className={buttonClass("ghost", "sm")}>Cancel</button>
      </div>
    </div>
  );
}
