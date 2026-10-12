"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRef, useState, useTransition } from "react";
import { shareIdea } from "../actions";

const field = "mt-1 block w-full rounded-xl border border-line bg-white px-3 text-[15px]";

export function IdeaForm({ weddingId, labels }: { weddingId: string; labels: { idea: string; link: string; about: string; share: string; areas: Record<string, string> } }) {
  const ref = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form ref={ref} className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      start(async () => {
        const r = await shareIdea(weddingId, String(f.get("body") ?? ""), String(f.get("link") ?? ""), String(f.get("vertical") ?? ""));
        setMsg(r);
        if (!r.error) ref.current?.reset();
      });
    }}>
      <label className="block text-sm font-medium">{labels.idea}<textarea name="body" rows={3} required maxLength={2000} className={`${field} py-2`} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">{labels.link}<input name="link" inputMode="url" placeholder="https://" className={`${field} h-11`} /></label>
        <label className="block text-sm font-medium">{labels.about}
          <select name="vertical" className={`${field} h-11`} defaultValue="">{Object.entries(labels.areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
      </div>
      <button disabled={pending} className={buttonClass("primary", "lg", "w-full sm:w-auto")}>{pending ? "…" : labels.share}</button>
      {msg?.error ? <p role="alert" className="text-sm text-burgundy-700">{msg.error}</p> : msg?.ok ? <p role="status" className="text-sm text-sage-800">{msg.ok}</p> : null}
    </form>
  );
}
