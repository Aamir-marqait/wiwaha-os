"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { portalLink } from "./actions";

/** Makes a one-time sign-in link and offers to copy it or send it on WhatsApp. */
export function LinkButton({ memberId, name, phone }: { memberId: string; name: string; phone: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  if (link) {
    const text = `Namaste ${name}, here is your Wiwaha client portal link (it works once): ${link}`;
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass("ghost", "sm")} onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
        {phone ? <a className={buttonClass("primary", "sm")} target="_blank" rel="noreferrer" href={`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`}>Send on WhatsApp</a> : null}
      </div>
    );
  }
  return (
    <div>
      <button type="button" disabled={pending} className={buttonClass("ghost", "sm")} onClick={() => start(async () => { const r = await portalLink(memberId); if (r.link) setLink(r.link); else setErr(r.error ?? "Failed"); })}>
        {pending ? "Making link…" : "Sign-in link"}
      </button>
      {err ? <p className="text-xs text-burgundy-700">{err}</p> : null}
    </div>
  );
}
