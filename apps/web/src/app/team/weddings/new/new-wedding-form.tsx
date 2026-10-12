"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createWedding } from "../actions";

const field = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

export function NewWeddingForm({ managers }: { managers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="space-y-5" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const s = (k: string) => String(f.get(k) ?? "");
      setError(null);
      start(async () => {
        const r = await createWedding({ title: s("title"), name: s("name"), phone: s("phone"), email: s("email"), role: s("role"), source: s("source"), start: s("start"), end: s("end"), guests: s("guests"), totalRupees: s("total"), managerId: s("manager"), rooms: s("rooms") });
        if (r.error) setError(r.error);
        else if (r.weddingId) router.push(`/team/weddings/${r.weddingId}${r.existing ? "?existing=1" : ""}`);
      });
    }}>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-serif text-xl font-semibold">The couple</legend>
        <label className={`${label} sm:col-span-2`}>Wedding name<input name="title" placeholder="e.g. Ananya & Rohan" required className={field} /></label>
        <label className={label}>Main contact<input name="name" required placeholder="Full name" className={field} /></label>
        <label className={label}>They are the
          <select name="role" className={field} defaultValue="bride"><option value="bride">Bride</option><option value="groom">Groom</option><option value="parent">Parent</option><option value="planner">Planner</option><option value="relative">Relative</option><option value="other">Other</option></select>
        </label>
        <label className={label}>Phone<input name="phone" inputMode="tel" placeholder="+91…" className={field} /></label>
        <label className={label}>Email<input name="email" type="email" className={field} /></label>
        <label className={label}>How they found us
          <select name="source" className={field} defaultValue="walk_in"><option value="walk_in">Walk-in</option><option value="phone">Phone call</option><option value="referral">Referral</option><option value="wedmegood">WedMeGood</option><option value="instagram">Instagram</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="other">Other</option></select>
        </label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-serif text-xl font-semibold">The booking</legend>
        <label className={label}>First day<input type="date" name="start" required className={field} /></label>
        <label className={label}>Last day<input type="date" name="end" className={field} /></label>
        <label className={label}>Guests<input name="guests" inputMode="numeric" className={field} /></label>
        <label className={label}>Contract value (₹)<input name="total" inputMode="numeric" required placeholder="20,00,000" className={field} /></label>
        <label className={label}>Complimentary rooms<input name="rooms" inputMode="numeric" placeholder="e.g. 10" className={field} /></label>
        <label className={label}>Event manager
          <select name="manager" className={field} defaultValue={managers[0]?.id ?? ""}>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </label>
      </fieldset>
      <button disabled={pending} className={buttonClass("primary", "lg")}>{pending ? "Creating…" : "Create wedding"}</button>
      <p className="text-xs text-ink-soft">This creates the Wedding Room, the 10/40/50 payment schedule and the planning stages, and the Contract agent drafts the contract for Prashanth's approval. If this family is already a lead (same phone), their lead is booked instead of creating a duplicate.</p>
      {error ? <p role="alert" className="text-sm text-burgundy-700">{error}</p> : null}
    </form>
  );
}
