"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveBrand } from "../actions";

const field = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

export interface BrandField { key: string; label: string; list?: boolean; rows?: number; help?: string }

function LogoField({ name, value, onChange, dark }: { name: string; value: string; onChange: (v: string) => void; dark?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <p className={label}>{name}</p>
      <div className={`grid h-20 place-items-center rounded-xl border border-line ${dark ? "bg-sage-900" : "bg-ivory-50"}`}>{value ? <img src={value} alt="" className="max-h-16 max-w-[80%] object-contain" /> : <span className="text-xs text-ink-soft">None yet</span>}</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${buttonClass("secondary", "sm")} cursor-pointer`}>
          <input type="file" accept="image/png,image/webp,image/svg+xml" className="sr-only" disabled={busy} onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            setBusy(true); setError(null);
            const supabase = createClient();
            const path = `brand/${crypto.randomUUID()}.${(f.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png"}`;
            const { error: up } = await supabase.storage.from("media").upload(path, f, { contentType: f.type });
            setBusy(false);
            if (up) setError(up.message); else onChange(supabase.storage.from("media").getPublicUrl(path).data.publicUrl);
          }} />
          {busy ? "Uploading…" : value ? "Replace" : "Upload"}
        </label>
        {value ? <button type="button" onClick={() => onChange("")} className={buttonClass("ghost", "sm")}>Remove</button> : null}
      </div>
      {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
    </div>
  );
}

export function BrandForm({ fields, initial, logos }: { fields: BrandField[]; initial: Record<string, string>; logos: { logoUrl: string; logoLightUrl: string; markUrl: string } }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [l, setL] = useState(logos);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveBrand({ fields: v, ...l }); setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Saved. New scripts use this from now on." }); if (!r.error) router.refresh(); }); }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <LogoField name="Logo (dark ink)" value={l.logoUrl} onChange={(x) => setL({ ...l, logoUrl: x })} />
        <LogoField name="Logo (ivory, for dark pictures)" value={l.logoLightUrl} onChange={(x) => setL({ ...l, logoLightUrl: x })} dark />
        <LogoField name="Small mark (reels)" value={l.markUrl} onChange={(x) => setL({ ...l, markUrl: x })} dark />
      </div>
      {fields.map((f) => (
        <label key={f.key} className={label}>
          {f.label}{f.list ? " (one per line)" : ""}
          {f.rows === 1 ? <input value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className={field} /> : <textarea rows={f.rows ?? 3} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className={field} />}
          {f.help ? <span className="mt-1 block text-xs normal-case tracking-normal text-ink-soft">{f.help}</span> : null}
        </label>
      ))}
      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-ivory-50/95 p-3 backdrop-blur sm:bottom-4">
        <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Saving…" : "Save brand"}</button>
        {msg ? <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-sage-700" : "text-burgundy-700"}`}>{msg.text}</span> : null}
      </div>
    </form>
  );
}
