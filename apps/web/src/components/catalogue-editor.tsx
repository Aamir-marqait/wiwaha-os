"use client";
import { Badge, buttonClass, Card, cn } from "@wiwaha/ui";
import { useState, useTransition } from "react";
import { saveCatalogueRow } from "@/app/team/catalogue/actions";
import { PhotoField } from "./photo-field";
import { toValues, type CatalogueSpec, type CatalogueValues, type FieldSpec } from "@/lib/catalogue";

const input = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";
const pretty = (s: string) => s.replace(/_/g, " ");

function display(f: FieldSpec, v: string | boolean): string {
  if (f.kind === "checkbox") return v ? f.label : "";
  if (v === "" || v === undefined) return "";
  if (f.kind === "rupees") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (f.kind === "percent") return `${v}% GST`;
  if (f.kind === "select") return pretty(String(v));
  if (f.kind === "image") return "photo";
  if (f.kind === "images") { const n = String(v).split(/\s+/).filter(Boolean).length; return n ? `${n} photo${n === 1 ? "" : "s"}` : ""; }
  return String(v);
}

export type RefOptions = Record<string, { id: string; label: string }[]>;

function RowForm({ spec, initial, id, onDone, refs }: { spec: CatalogueSpec; initial: CatalogueValues; id: string | null; onDone: () => void; refs: RefOptions }) {
  const [v, setV] = useState<CatalogueValues>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, x: string | boolean) => setV((o) => ({ ...o, [k]: x }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveCatalogueRow(spec.key, id, v); if (r.error) setError(r.error); else onDone(); }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {spec.fields.map((f) => f.kind === "checkbox" ? (
          <label key={f.key} className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={v[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}</label>
        ) : f.kind === "image" || f.kind === "images" ? (
          <PhotoField key={f.key} label={f.label} value={String(v[f.key] ?? "")} multiple={f.kind === "images"} onChange={(x) => set(f.key, x)} />
        ) : f.kind === "textarea" ? (
          <label key={f.key} className={cn(label, "sm:col-span-2")}>{f.label}<textarea value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} rows={2} className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm normal-case tracking-normal" /></label>
        ) : f.kind === "ref" ? (
          <label key={f.key} className={label}>{f.label}{f.required ? " *" : ""}
            <select value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} className={input}><option value="">—</option>{(refs[f.key] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
        ) : f.kind === "select" ? (
          <label key={f.key} className={label}>{f.label}{f.required ? " *" : ""}
            <select value={String(v[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} className={input}>{f.options!.map((o) => <option key={o} value={o}>{o ? pretty(o) : "—"}</option>)}</select>
          </label>
        ) : (
          <label key={f.key} className={label}>{f.label}{f.required ? " *" : ""}
            <input type={f.kind === "date" ? "date" : "text"} inputMode={["number", "rupees", "percent"].includes(f.kind) ? "decimal" : undefined} value={String(v[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={input} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Saving…" : id ? "Save changes" : `Add ${spec.singular}`}</button>
        <button type="button" onClick={onDone} className={buttonClass("ghost", "md")}>Cancel</button>
        {error ? <span role="alert" className="text-sm text-burgundy-700">{error}</span> : null}
      </div>
    </form>
  );
}

/** List + add + edit for one reference list (see lib/catalogue.ts). */
export function CatalogueEditor({ spec, rows, canEdit, refs = {} }: { spec: CatalogueSpec; rows: Record<string, unknown>[]; canEdit: boolean; refs?: RefOptions }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const primary = spec.fields.find((f) => f.primary) ?? spec.fields[0]!;
  return (
    <div className="space-y-3">
      {canEdit ? (editing === "new"
        ? <Card className="p-4 sm:p-5"><RowForm spec={spec} initial={toValues(spec, null)} id={null} onDone={() => setEditing(null)} refs={refs} /></Card>
        : <button onClick={() => setEditing("new")} className={buttonClass("primary", "md")}>+ Add {spec.singular}</button>) : null}
      {rows.length === 0 ? <Card className="p-5 text-sm text-ink-soft">Nothing here yet.</Card> : null}
      <ul className="space-y-2">
        {rows.map((r) => {
          const id = String(r.id);
          const values = toValues(spec, r);
          const inactive = "active" in r && r.active === false;
          return (
            <li key={id}>
              <Card className={cn("p-4", inactive && "opacity-60")}>
                {editing === id ? <RowForm spec={spec} initial={values} id={id} onDone={() => setEditing(null)} refs={refs} /> : (
                  <div className="flex items-start justify-between gap-3">
                    {(() => { const img = spec.fields.find((f) => f.kind === "image"); const u = img ? String(values[img.key] ?? "") : ""; return u ? <img src={u} alt="" className="size-14 shrink-0 rounded-lg border border-line object-cover" /> : null; })()}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{String(values[primary.key] ?? "")} {inactive ? <Badge>inactive</Badge> : null}</p>
                      <p className="mt-0.5 text-sm text-ink-soft">{spec.fields.filter((f) => f !== primary && f.key !== "active" && f.kind !== "textarea").map((f) => (f.kind === "ref" ? (refs[f.key] ?? []).find((o) => o.id === values[f.key])?.label ?? "" : display(f, values[f.key]!))).filter(Boolean).join(" · ")}</p>
                    </div>
                    {canEdit ? <button onClick={() => setEditing(id)} className={buttonClass("secondary", "sm")}>Edit</button> : null}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
