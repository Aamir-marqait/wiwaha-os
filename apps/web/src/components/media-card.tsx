"use client";
import { Badge, buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMedia, setPrimaryMedia, updateMedia } from "@/app/team/media/actions";

export interface MediaCardData {
  id: string; kind: "image" | "video"; url: string; thumb_url: string | null; title: string | null; description: string | null; tags: string[];
  look: string; angle: string | null; is_primary: boolean; venue_area_id: string | null; folder_id: string | null; duration_ms: number | null; status: string; status_error: string | null; described_by: string | null; created_at: string;
}

export const LOOK_LABELS: Record<string, string> = { plain: "Plain (no décor)", decorated: "Decorated", event: "Real event", detail: "Detail", people: "People", aerial: "Aerial", other: "Other" };
const field = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

/** One photo or clip: preview, what it shows, and quick edits. */
export function MediaCard({ m, areas, folders, canDelete, showPrimary }: { m: MediaCardData; areas?: { id: string; name: string }[]; folders?: { id: string; label: string }[]; canDelete: boolean; showPrimary?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: m.title ?? "", description: m.description ?? "", tags: m.tags.join(", "), look: m.look, areaId: m.venue_area_id ?? "", angle: m.angle ?? "", folderId: m.folder_id ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string }>) => start(async () => { const r = await fn(); if (r.error) setError(r.error); else { setError(null); setOpen(false); router.refresh(); } });
  const preview = m.kind === "video" ? m.thumb_url : m.url;
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="relative aspect-[4/3] bg-ivory-100">
        {preview ? <img src={preview} alt={m.title ?? ""} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-xs text-ink-soft">Clip</div>}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {m.kind === "video" ? <Badge tone="solid">Clip{m.duration_ms ? ` · ${Math.round(m.duration_ms / 1000)}s` : ""}</Badge> : null}
          {showPrimary && m.is_primary ? <Badge tone="gold">Main photo</Badge> : null}
          {m.status === "failed" ? <Badge tone="burgundy">Can't use</Badge> : null}
        </div>
      </div>
      <div className="space-y-1.5 p-3">
        <p className="line-clamp-1 text-sm font-medium">{m.title || "Untitled"}</p>
        <p className="line-clamp-2 text-xs text-ink-soft">{m.status_error ?? (m.description || (m.described_by ? "" : Date.parse(m.created_at) > Date.now() - 5 * 60_000 ? "Describing…" : "No description yet. Edit to add one."))}</p>
        <p className="flex flex-wrap gap-1 text-[11px] text-ink-soft"><span>{LOOK_LABELS[m.look] ?? m.look}</span>{m.angle ? <span>· {m.angle}</span> : null}</p>
        {!open ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>Edit</button>
            {showPrimary && !m.is_primary && m.venue_area_id && m.kind === "image" ? <button type="button" disabled={pending} onClick={() => act(() => setPrimaryMedia(m.id))} className={buttonClass("ghost", "sm")}>Make main</button> : null}
            <a href={m.url} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>Open</a>
          </div>
        ) : (
          <form className="space-y-2 pt-1" onSubmit={(e) => { e.preventDefault(); act(() => updateMedia(m.id, { ...v, areaId: v.areaId || null, folderId: v.folderId || null })); }}>
            <label className={label}>Title<input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className={field} /></label>
            <label className={label}>What's in it<textarea value={v.description} rows={3} onChange={(e) => setV({ ...v, description: e.target.value })} className={field} /></label>
            <label className={label}>Tags (commas)<input value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} className={field} /></label>
            <label className={label}>Look<select value={v.look} onChange={(e) => setV({ ...v, look: e.target.value })} className={field}>{Object.entries(LOOK_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {areas ? <label className={label}>Area<select value={v.areaId} onChange={(e) => setV({ ...v, areaId: e.target.value })} className={field}><option value="">None</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label> : null}
            <label className={label}>Angle or note<input value={v.angle} onChange={(e) => setV({ ...v, angle: e.target.value })} placeholder="e.g. From the steps, evening" className={field} /></label>
            {folders ? <label className={label}>Folder<select value={v.folderId} onChange={(e) => setV({ ...v, folderId: e.target.value })} className={field}><option value="">Top level</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label> : null}
            <div className="flex flex-wrap gap-1.5">
              <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
              {canDelete ? <button type="button" disabled={pending} onClick={() => { if (window.confirm("Remove this from the library?")) act(() => deleteMedia(m.id)); }} className={buttonClass("danger", "sm")}>Remove</button> : null}
            </div>
          </form>
        )}
        {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
      </div>
    </li>
  );
}
