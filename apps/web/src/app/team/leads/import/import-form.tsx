"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { importLeads, type ImportResult } from "./actions";

export function ImportForm() {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const source = String(new FormData(e.currentTarget).get("source")); start(async () => setResult(await importLeads(text, source))); }}>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">Where are these from?
        <select name="source" className="mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case"><option value="meta_form">Meta lead forms (Instagram / Facebook)</option><option value="google_form">Google Ads lead forms</option><option value="wedmegood">WedMeGood</option><option value="other">Something else</option></select>
      </label>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">CSV file
        <input type="file" accept=".csv,.tsv,.txt,text/csv" className="mt-1 block w-full text-sm normal-case" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      </label>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft">…or paste it here
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"full_name,phone_number,email,city\nPriya Natarajan,9900011103,priya@example.com,Bengaluru"} className="mt-1 block w-full rounded-xl border border-line px-3 py-2 font-mono text-xs normal-case" />
      </label>
      <button disabled={pending || !text.trim()} className={buttonClass("primary", "md")}>{pending ? "Importing…" : "Import leads"}</button>
      {result?.error ? <p role="alert" className="text-sm text-burgundy-700">{result.error}</p> : null}
      {result && !result.error ? (
        <div role="status" className="rounded-xl bg-sage-100 px-3 py-2 text-sm text-sage-800">
          <p><strong>{result.imported}</strong> imported{result.duplicates ? `, ${result.duplicates} already there` : ""}. Lead Desk is scoring them and drafting replies for Approvals.</p>
          {result.problems?.length ? <ul className="mt-1 list-disc pl-4 text-xs text-burgundy-700">{result.problems.slice(0, 8).map((p) => <li key={p.line}>Line {p.line}: {p.reason}</li>)}</ul> : null}
        </div>
      ) : null}
    </form>
  );
}
