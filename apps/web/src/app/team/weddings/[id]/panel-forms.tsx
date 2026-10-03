"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { postToRoom, repriceLine } from "./actions";

export function RepriceForm({ weddingId, lineId }: { weddingId: string; lineId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => {
      e.preventDefault();
      const v = Number(String(new FormData(e.currentTarget).get("price")).replace(/[,₹\s]/g, ""));
      start(async () => setError((await repriceLine(weddingId, lineId, v)).error ?? null));
    }}>
      <input name="price" inputMode="numeric" placeholder="₹ each" aria-label="Price in rupees" className="h-8 w-24 rounded-lg border border-line px-2 text-xs" />
      <button disabled={pending} className={buttonClass("secondary", "sm")}>{pending ? "…" : "Set"}</button>
      {error ? <span className="text-xs text-burgundy-700">{error}</span> : null}
    </form>
  );
}

export function PostBox({ weddingId }: { weddingId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="flex gap-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const body = String(new FormData(form).get("body") ?? "");
      start(async () => {
        const r = await postToRoom(weddingId, body);
        setError(r.error ?? null);
        if (!r.error) form.reset();
      });
    }}>
      <input name="body" placeholder="Write to the couple's portal chat…" className="h-10 min-w-0 flex-1 rounded-xl border border-line px-3 text-sm" />
      <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "…" : "Send"}</button>
      {error ? <span className="text-xs text-burgundy-700">{error}</span> : null}
    </form>
  );
}
