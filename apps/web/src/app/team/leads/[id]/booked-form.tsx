"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SplitPicker } from "@/components/split-picker";
import type { RelativePart } from "@/lib/payment-parts";
import { markBooked } from "../actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm";

/** Creates the wedding: payment schedule, stage cards and a contract draft for Prashanth follow automatically. */
export function BookedForm({ leadId, defaultTitle, defaultDate, managers, standard, canChangeSplit }: { leadId: string; defaultTitle: string; defaultDate: string | null; managers: { id: string; name: string }[]; standard: RelativePart[]; canChangeSplit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await markBooked(leadId, {
            start: String(f.get("start")), end: String(f.get("end") || f.get("start")), totalRupees: Number(String(f.get("total")).replace(/[,₹\s]/g, "")),
            managerId: String(f.get("manager") ?? ""), title: String(f.get("title") ?? ""),
            rooms: String(f.get("rooms") ?? ""), parts: String(f.get("parts") ?? "") || undefined,
          });
          if (r.error) setError(r.error);
          else if (r.weddingId) router.push(`/team/weddings/${r.weddingId}${r.note ? `?note=${encodeURIComponent(r.note)}` : ""}`);
        });
      }}
    >
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Couple<input name="title" defaultValue={defaultTitle} className={field} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">First day<input type="date" name="start" required defaultValue={defaultDate ?? ""} className={field} /></label>
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Last day<input type="date" name="end" defaultValue={defaultDate ?? ""} className={field} /></label>
      </div>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Contract value (₹)<input name="total" inputMode="numeric" required placeholder="20,00,000" className={field} /></label>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Complimentary rooms<input name="rooms" inputMode="numeric" placeholder="e.g. 10" className={field} /></label>
      <SplitPicker standard={standard} canChange={canChangeSplit} />
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Event manager
        <select name="manager" className={field} defaultValue={managers[0]?.id ?? ""}>
          {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <button disabled={pending} className={buttonClass("gold", "md", "w-full")}>{pending ? "Booking…" : "Mark as booked"}</button>
      <p className="text-xs text-ink-soft">Creates the wedding, its payment parts and planning stages. The contract waits for Prashanth&rsquo;s approval before it&rsquo;s sent.</p>
      {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
    </form>
  );
}
