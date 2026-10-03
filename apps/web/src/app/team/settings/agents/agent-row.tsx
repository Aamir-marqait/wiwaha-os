"use client";
import type { AgentAutonomy } from "@wiwaha/db";
import { Badge, cn } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { updateAgent } from "./actions";

const DIAL: { value: AgentAutonomy; label: string; hint: string }[] = [
  { value: "draft", label: "Draft", hint: "A person approves every output" },
  { value: "act_and_notify", label: "Act & notify", hint: "Acts, then tells the team" },
  { value: "act_silently", label: "Act silently", hint: "Acts on its own" },
];
const MODELS = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (fast triage)" },
  { value: "claude-sonnet-5-5", label: "Sonnet 5.5 (most agents)" },
  { value: "claude-opus-5-5", label: "Opus 5.5 (reasoning)" },
  { value: "claude-fable-5-1", label: "Fable 5.1 (most capable)" },
];

export interface AgentView {
  key: string; name: string; job: string; humanGate: string; phase: number; implemented: boolean; enabled: boolean; autonomy: AgentAutonomy; model: string;
  runs24h: number; gated24h: number;
}

export function AgentRow({ a, canEdit }: { a: AgentView; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (patch: Parameters<typeof updateAgent>[1]) => start(async () => setError((await updateAgent(a.key, patch)).error ?? null));

  return (
    <li className={cn("px-4 py-4 sm:px-5", !a.implemented && "opacity-75")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{a.name}</p>
            {a.implemented ? (a.enabled ? <Badge tone="sage">Live</Badge> : <Badge tone="burgundy">Paused</Badge>) : <Badge>Phase {a.phase}</Badge>}
            {a.implemented ? <span className="text-xs text-ink-soft">{a.runs24h} runs · {a.gated24h} sent for approval (24 h)</span> : null}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{a.job}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Human gate: {a.humanGate}</p>
        </div>
        <label className={cn("flex items-center gap-2 text-sm", !canEdit && "pointer-events-none opacity-60")}>
          <span className="text-xs text-ink-soft">{a.enabled ? "On" : "Off"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={a.enabled}
            aria-label={`${a.enabled ? "Pause" : "Resume"} ${a.name}`}
            disabled={pending || !canEdit}
            onClick={() => save({ enabled: !a.enabled })}
            className={cn("relative h-6 w-11 rounded-full transition-colors", a.enabled ? "bg-sage-600" : "bg-ivory-300")}
          >
            <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", a.enabled ? "left-[22px]" : "left-0.5")} />
          </button>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-ivory-100 p-0.5 ring-1 ring-line" role="radiogroup" aria-label="Autonomy">
          {DIAL.map((d) => (
            <button key={d.value} type="button" title={d.hint} role="radio" aria-checked={a.autonomy === d.value} disabled={pending || !canEdit} onClick={() => save({ autonomy: d.value })}
              className={cn("rounded-full px-3 py-1 text-xs font-medium", a.autonomy === d.value ? "bg-sage-700 text-white" : "text-ink-soft hover:text-ink")}>
              {d.label}
            </button>
          ))}
        </div>
        <select defaultValue={a.model} disabled={pending || !canEdit} onChange={(e) => save({ model: e.target.value })} className="h-8 rounded-full border border-line bg-white px-3 text-xs" aria-label="Model">
          {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {error ? <span className="text-xs text-burgundy-700">{error}</span> : null}
      </div>
    </li>
  );
}
