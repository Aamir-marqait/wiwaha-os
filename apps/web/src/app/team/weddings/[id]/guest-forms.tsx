"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { saveGuestWelcome } from "./actions";

/** Copy the guest link, share it on WhatsApp with the welcome, and edit the welcome. */
export function GuestShare({ weddingId, url, title, welcome, canEdit }: { weddingId: string; url: string; title: string; welcome: string | null; canEdit: boolean }) {
  const [text, setText] = useState(welcome ?? "");
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const share = `${text.trim() || `Welcome to ${title} at Wiwaha by Praman!`}\n\nItinerary, the estate and services during your stay: ${url}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-ivory-50 px-2 font-mono text-xs" />
        <button type="button" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }} className={buttonClass("secondary", "sm")}>{copied ? "Copied" : "Copy"}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer" className={buttonClass("primary", "sm")}>Share on WhatsApp</a>
      </div>
      {canEdit ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveGuestWelcome(weddingId, text); setMsg(r.error ?? "Saved."); }); }}>
          <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Welcome message for guests
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={`Welcome! We're delighted you're joining ${title}…`} className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm normal-case tracking-normal" />
          </label>
          <button disabled={pending} className={buttonClass("secondary", "sm")}>{pending ? "Saving…" : "Save welcome"}</button>
          {msg ? <span className="ml-2 text-xs text-ink-soft" role="status">{msg}</span> : null}
        </form>
      ) : null}
    </div>
  );
}
