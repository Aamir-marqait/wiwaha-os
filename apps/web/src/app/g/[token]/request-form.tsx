"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { requestAddOn } from "./actions";

const field = "mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px]";

/** One form for the whole link: who you are, what you need, anything we should know. */
export function RequestForm({ token, options, days }: { token: string; options: { id: string; name: string }[]; days: { value: string; label: string }[] }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return (
    <div role="status" className="space-y-3 rounded-xl bg-sage-100 px-4 py-4 text-sm text-sage-800">
      <p>{msg.ok}</p>
      <button type="button" onClick={() => setMsg(null)} className={buttonClass("secondary", "sm")}>Ask for something else</button>
    </div>
  );
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const s = (k: string) => String(f.get(k) ?? "");
      start(async () => setMsg(await requestAddOn(token, { optionId: s("option"), name: s("name"), phone: s("phone"), room: s("room"), quantity: "1", date: s("date"), notes: s("notes") })));
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Your name<input name="name" required autoComplete="name" className={field} /></label>
        <label className="block text-sm">Phone number<input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="98450 12345" className={field} /></label>
      </div>
      <label className="block text-sm">What do you need?
        <select name="option" defaultValue="" className={field}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value="">Something else (write below)</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Which day
          <select name="date" className={field} defaultValue="">{[{ value: "", label: "Any" }, ...days].map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        </label>
        <label className="block text-sm">Room (if you know it)<input name="room" className={field} /></label>
      </div>
      <label className="block text-sm">Flight, timing or anything we should know<textarea name="notes" rows={3} className={`${field} h-auto py-2`} /></label>
      {msg?.error ? <p role="alert" className="text-sm text-burgundy-700">{msg.error}</p> : null}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")}>{pending ? "Sending…" : "Send request"}</button>
    </form>
  );
}
