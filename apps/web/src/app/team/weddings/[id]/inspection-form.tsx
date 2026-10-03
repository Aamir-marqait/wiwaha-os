"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordInspection } from "./actions";

const AREAS = ["Grand Lawn", "Pavilion", "Sage Hall", "Guest rooms", "Kitchen", "Furniture and linen", "Restrooms", "Parking and driveway"];
type Row = { area: string; ok: boolean; note: string; damageRupees: number; file: File | null };

export function InspectionForm({ weddingId }: { weddingId: string }) {
  const [rows, setRows] = useState<Row[]>(AREAS.map((area) => ({ area, ok: true, note: "", damageRupees: 0, file: null })));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows((xs) => xs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const supabase = createClient();
        const items = [];
        for (const r of rows) {
          let photoPath: string | null = null;
          if (r.file) {
            photoPath = `inspection-${weddingId}/${r.area.replace(/\W+/g, "-").toLowerCase()}-${Date.now()}.${r.file.name.split(".").pop() ?? "jpg"}`;
            const up = await supabase.storage.from("task-proof").upload(photoPath, r.file, { upsert: true });
            if (up.error) { setMsg(up.error.message); return; }
          }
          items.push({ area: r.area, ok: r.ok, note: r.note, damageRupees: r.damageRupees, photoPath });
        }
        const res = await recordInspection(weddingId, items);
        setMsg(res.error ?? "Inspection saved. Finance will propose the deposit decision.");
      });
    }}>
      {rows.map((r, i) => (
        <div key={r.area} className="rounded-xl bg-ivory-100 px-3 py-2">
          <label className="flex items-center justify-between gap-2 text-sm"><span>{r.area}</span><span className="flex items-center gap-1 text-xs"><input type="checkbox" checked={r.ok} onChange={(e) => set(i, { ok: e.target.checked })} /> All good</span></label>
          {!r.ok ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input placeholder="What's damaged?" value={r.note} onChange={(e) => set(i, { note: e.target.value })} className="col-span-2 h-9 rounded-lg border border-line px-2 text-sm" />
              <input inputMode="numeric" placeholder="Cost ₹" onChange={(e) => set(i, { damageRupees: Number(e.target.value.replace(/[,₹\s]/g, "")) || 0 })} className="h-9 rounded-lg border border-line px-2 text-sm" />
              <input type="file" accept="image/*" capture="environment" onChange={(e) => set(i, { file: e.target.files?.[0] ?? null })} className="text-xs" />
            </div>
          ) : null}
        </div>
      ))}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")}>{pending ? "Saving…" : "Save inspection"}</button>
      {msg ? <p className="text-sm text-ink-soft">{msg}</p> : null}
    </form>
  );
}
