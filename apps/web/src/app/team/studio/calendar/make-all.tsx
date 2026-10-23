"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveAllScripts } from "../actions";

/** Step 3: turn every written script into content in one go. */
export function MakeAll({ waiting }: { waiting: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending || waiting === 0} onClick={() => start(async () => { const r = await approveAllScripts(); setMsg(r.error ?? `${r.made} sent to be made.`); router.refresh(); })} className={buttonClass("primary", "sm")}>{pending ? "Starting…" : `Make all ${waiting} as content`}</button>
      {msg ? <span role="status" className="text-sm text-ink-soft">{msg}</span> : null}
    </div>
  );
}
