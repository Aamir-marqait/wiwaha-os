"use client";
import { useState } from "react";

/** A read-only value with a Copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 truncate text-sm font-medium" title={label}>{label}</span>
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-ivory-50 px-2 font-mono text-xs" />
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="shrink-0 rounded-full bg-sage-100 px-3 py-1.5 text-xs font-medium text-sage-800">{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
