"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { importSpend } from "./actions";

export function SpendForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; start(async () => { const r = await importSpend(String(new FormData(form).get("csv") ?? "")); setMsg(r.error ?? r.ok ?? null); if (!r.error) form.reset(); }); }}>
      <textarea name="csv" rows={4} placeholder={"meta,2026-10-01,Wedding season,4500\ngoogle,2026-10-01,Search,3200"} className="block w-full rounded-xl border border-line px-3 py-2 font-mono text-xs" />
      <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Importing…" : "Import spend"}</button>
      {msg ? <p className="text-sm text-ink-soft">{msg}</p> : null}
    </form>
  );
}
