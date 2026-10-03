"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { addWindow } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WindowForm({ people }: { people: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="space-y-3" action={(f) => start(async () => { const r = await addWindow(f); setMsg(r.error ?? "Saved."); })}>
      <select name="profile_id" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1 rounded-lg bg-ivory-100 px-2 py-1 text-xs"><input type="checkbox" name="weekday" value={i} defaultChecked={i >= 1 && i <= 6} />{d}</label>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <input type="time" name="start" defaultValue="10:00" className="h-10 rounded-xl border border-line bg-white px-3 text-sm" aria-label="From" />
        <input type="time" name="end" defaultValue="18:00" className="h-10 rounded-xl border border-line bg-white px-3 text-sm" aria-label="Until" />
      </div>
      <button disabled={pending} className={buttonClass("primary", "sm", "w-full")}>{pending ? "Saving…" : "Add hours"}</button>
      {msg ? <p className="text-xs text-ink-soft">{msg}</p> : null}
    </form>
  );
}
