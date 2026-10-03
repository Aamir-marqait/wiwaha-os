"use client";
import { Badge, buttonClass, Card } from "@wiwaha/ui";
import Link from "next/link";
import { useState, useTransition } from "react";
import { decide } from "./actions";

export interface ApprovalView {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  agentName: string | null;
  priority: number;
  flags: string[];
  createdAt: string;
  createdLabel: string;
  leadId: string | null;
  body: string | null;
  enquiry: string | null;
  channel: string | null;
  to: string | null;
}

const FLAG_TEXT: Record<string, string> = {
  price_quote: "The AI draft stated a price",
  discount_promise: "The AI draft offered a discount",
  date_commitment: "The AI draft promised a date",
  decor_policy: "The AI draft invited outside décor",
  guarantee: "Promises an outcome",
  mentions_discount: "Mentions discounts",
};

export function ApprovalCard({ a }: { a: ApprovalView }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(a.body ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (decision: "approved" | "edited" | "rejected") =>
    start(async () => {
      setError(null);
      const r = await decide(a.id, decision, decision === "edited" ? body : null, note);
      if (r.error) setError(r.error);
      else setDone(decision === "rejected" ? "Rejected" : decision === "edited" ? "Edited and approved" : "Approved");
    });

  if (done) {
    return <Card className="px-4 py-3 text-sm text-ink-soft">{done}: {a.title}</Card>;
  }

  return (
    <Card className={a.priority === 1 ? "ring-2 ring-burgundy-200" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line/70 px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium">{a.leadId ? <Link href={`/team/leads/${a.leadId}`} className="hover:underline">{a.title}</Link> : a.title}</p>
          <p className="text-xs text-ink-soft">{a.agentName ?? "Agent"} · {a.kind.replace(/_/g, " ")} · {a.createdLabel}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {a.priority === 1 ? <Badge tone="burgundy">Priority</Badge> : null}
          {a.channel ? <Badge>{a.channel}</Badge> : null}
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {a.summary ? <p className="text-xs text-ink-soft">{a.summary}</p> : null}
        {a.flags.length ? (
          <ul className="space-y-1">
            {a.flags.map((f) => <li key={f} className="rounded-lg bg-burgundy-50 px-3 py-1.5 text-xs text-burgundy-700">⚑ {FLAG_TEXT[f] ?? f}. The safe version is shown below.</li>)}
          </ul>
        ) : null}
        {a.enquiry ? <p className="rounded-lg bg-ivory-100 px-3 py-2 text-xs italic text-ink-soft">They wrote: “{a.enquiry}”</p> : null}
        {a.body !== null ? (
          editing ? (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="block w-full rounded-xl border border-sage-300 bg-white p-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-sage-200" />
          ) : (
            <p className="whitespace-pre-line rounded-xl bg-sage-50 p-3 text-[15px] leading-relaxed text-ink ring-1 ring-sage-100">{a.body}</p>
          )
        ) : null}
        {a.to ? <p className="text-xs text-ink-soft">To {a.to}. Phase 1 records approved messages; sending switches on with the WhatsApp connector.</p> : null}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="block h-9 w-full rounded-lg border border-line bg-white px-3 text-sm" />
        {error ? <p role="alert" className="text-sm text-burgundy-700">{error}</p> : null}
        <div className="grid grid-cols-3 gap-2">
          {editing ? (
            <button disabled={pending} onClick={() => run("edited")} className={buttonClass("primary", "md", "col-span-2")}>Save & approve</button>
          ) : (
            <button disabled={pending} onClick={() => run("approved")} className={buttonClass("primary", "md")}>Approve</button>
          )}
          {a.body !== null ? (
            <button disabled={pending} onClick={() => setEditing(!editing)} className={buttonClass("secondary", "md", editing ? "hidden" : "")}>Edit</button>
          ) : null}
          <button disabled={pending} onClick={() => run("rejected")} className={buttonClass("danger", "md")}>Reject</button>
        </div>
      </div>
    </Card>
  );
}
