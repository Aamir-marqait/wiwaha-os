"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { dismissMessage, markSentManually } from "./actions";

/** Opens WhatsApp / the mail app with the approved text, then asks the sender to confirm. */
export function SendRow({ id, href, label }: { id: string; href: string | null; label: string }) {
  const [pending, start] = useTransition();
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {href ? <a href={href} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} className={buttonClass(opened ? "secondary" : "primary", "sm")}>{label}</a> : <span className="text-xs text-burgundy-700">No address on file</span>}
      <button disabled={pending} onClick={() => start(async () => setError((await markSentManually(id)).error ?? null))} className={buttonClass(opened ? "primary" : "secondary", "sm")}>{pending ? "…" : "I've sent it"}</button>
      <button disabled={pending} onClick={() => start(async () => setError((await dismissMessage(id)).error ?? null))} className={buttonClass("ghost", "sm")}>Not needed</button>
      {error ? <span role="alert" className="text-xs text-burgundy-700">{error}</span> : null}
    </div>
  );
}
