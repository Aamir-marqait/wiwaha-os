"use client";
import type { AppRole } from "@wiwaha/db";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { roleDefaults, SECTION_HINTS, SECTION_LABELS, SECTION_ROLES, SECTIONS, type Section } from "@/lib/sections";
import { setSections } from "./actions";

/** Which headings one person sees. Sections their role can't use are greyed out. */
export function AccessEditor({ userId, role, current }: { userId: string; role: AppRole; current: string[] | null }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(current ?? roleDefaults(role)));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (role === "owner") return <p className="text-xs text-ink-soft">Sees everything.</p>;
  const summary = (current ?? roleDefaults(role)).filter((s): s is Section => (SECTIONS as readonly string[]).includes(s)).map((s) => SECTION_LABELS[s]).join(", ") || "Only Today, Tasks and Approvals";
  const save = (value: string[] | null) => start(async () => {
    const r = await setSections(userId, value);
    setMsg(r.error ?? r.ok ?? null);
    if (!r.error) setOpen(false);
  });
  return (
    <div className="w-full">
      <button type="button" onClick={() => setOpen(!open)} className="text-left text-xs text-sage-700 hover:underline">
        Sees: {summary}{current ? "" : " (role default)"} · {open ? "Close" : "Change"}
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-xl border border-line bg-ivory-50 p-3">
          {SECTIONS.map((s) => {
            const allowed = SECTION_ROLES[s].includes(role);
            return (
              <label key={s} className={`flex items-start gap-2 text-sm ${allowed ? "" : "opacity-50"}`}>
                <input type="checkbox" className="mt-1 accent-sage-600" disabled={!allowed} checked={allowed && picked.has(s)}
                  onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(s); else n.delete(s); setPicked(n); }} />
                <span><span className="font-medium">{SECTION_LABELS[s]}</span><span className="block text-xs text-ink-soft">{allowed ? SECTION_HINTS[s] : "Needs a different role"}</span></span>
              </label>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={pending} onClick={() => save([...picked])} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : "Save access"}</button>
            {current ? <button type="button" disabled={pending} onClick={() => save(null)} className={buttonClass("ghost", "sm")}>Reset to role default</button> : null}
          </div>
        </div>
      ) : null}
      {msg ? <p className="mt-1 text-xs text-ink-soft" role="status">{msg}</p> : null}
    </div>
  );
}
