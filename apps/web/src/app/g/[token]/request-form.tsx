"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { requestAddOn } from "./actions";

const field = "mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px]";

export function RequestForm({ token, optionId, days }: { token: string; optionId: string; days: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <p role="status" className="rounded-xl bg-sage-100 px-3 py-2 text-sm text-sage-800">{msg.ok}</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "md")}>Request</button>;
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const s = (k: string) => String(f.get(k) ?? "");
      start(async () => setMsg(await requestAddOn(token, { optionId, name: s("name"), phone: s("phone"), room: s("room"), quantity: s("quantity"), date: s("date"), notes: s("notes") })));
    }}>
      <label className="block text-sm">Your name<input name="name" required className={field} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Phone<input name="phone" required inputMode="tel" placeholder="+91…" className={field} /></label>
        <label className="block text-sm">Room (if staying)<input name="room" className={field} /></label>
        <label className="block text-sm">How many<input name="quantity" inputMode="numeric" defaultValue="1" className={field} /></label>
        <label className="block text-sm">Which day
          <select name="date" className={field} defaultValue="">{[{ value: "", label: "Any" }, ...days].map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        </label>
      </div>
      <label className="block text-sm">Anything we should know<input name="notes" className={field} /></label>
      {msg?.error ? <p role="alert" className="text-sm text-burgundy-700">{msg.error}</p> : null}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")}>{pending ? "Sending…" : "Send request"}</button>
    </form>
  );
}
