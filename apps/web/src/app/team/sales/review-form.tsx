"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRef, useState, useTransition } from "react";
import { addReview } from "./actions";

export function ReviewForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} className="space-y-2" action={(f) => start(async () => { const r = await addReview(f); setMsg(r.error ?? "Added. Reputation is drafting a reply for approval."); if (!r.error) ref.current?.reset(); })}>
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <select name="platform" className="h-10 rounded-xl border border-line bg-white px-3 text-sm"><option value="google">Google</option><option value="wedmegood">WedMeGood</option></select>
        <select name="rating" className="h-10 rounded-xl border border-line bg-white px-3 text-sm">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}</select>
      </div>
      <input name="author" placeholder="Reviewer's name" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" />
      <textarea name="body" rows={3} placeholder="Paste the review" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
      <button disabled={pending} className={buttonClass("secondary", "sm", "w-full")}>{pending ? "Adding…" : "Add review"}</button>
      {msg ? <p className="text-xs text-ink-soft">{msg}</p> : null}
    </form>
  );
}
