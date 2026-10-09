"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { postToRoom, recordPayment, repriceLine } from "./actions";

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

/** Record a bank / UPI / cheque payment against a milestone. */
export function PaymentForm({ weddingId, paymentId, amountRupees }: { weddingId: string; paymentId: string; amountRupees: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>Record payment</button>;
  return (
    <form className="mt-2 grid w-full grid-cols-2 gap-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      start(async () => setError((await recordPayment(weddingId, paymentId, { method: String(f.get("method")), reference: String(f.get("reference") ?? ""), rupees: Number(String(f.get("rupees")).replace(/[,₹\s]/g, "")) })).error ?? null));
    }}>
      <select name="method" className="h-9 rounded-lg border border-line px-2 text-sm"><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="card">Card</option></select>
      <input name="rupees" inputMode="decimal" defaultValue={amountRupees} aria-label="Amount received in rupees" className="h-9 rounded-lg border border-line px-2 text-sm" />
      <input name="reference" placeholder="UTR / cheque no." className="col-span-2 h-9 rounded-lg border border-line px-2 text-sm" />
      <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "…" : "Mark received"}</button>
      <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
      {error ? <span role="alert" className="col-span-2 text-xs text-burgundy-700">{error}</span> : null}
    </form>
  );
}
