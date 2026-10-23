"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createStudioItem, type NewItem } from "./actions";

const field = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";
const FORMATS: [string, string][] = [["carousel", "Carousel"], ["single_post", "Post"], ["story", "Story"], ["reel", "Reel"]];
const IDEAS = ["Why families fly in for a lawn wedding", "A day at the estate, golden hour", "Mehendi courtyard, set up", "Our 15 minutes from the airport"];
type Photo = { id: string; url: string; kind: string; title: string; areaId: string | null };

/** Describe it, pick a shape, create. Everything else is tucked under "More options". */
export function QuickCreate({ pillars, photos, areas }: { pillars: string[]; photos: Photo[]; areas: { id: string; name: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState<NewItem>({ type: "carousel", brief: "", pillar: "", slides: "6", seconds: "30", aspect: "4:5", scheme: "light", assetIds: [], direction: "", scheduledFor: "" });
  const [space, setSpace] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof NewItem>(k: K, x: NewItem[K]) => setV((o) => ({ ...o, [k]: x }));
  const shown = photos.filter((p) => !space || p.areaId === space);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createStudioItem(v); if (r.error) setError(r.error); else if (r.id) router.push(`/team/studio/${r.id}`); }); }}>
      <label className={label}>
        What do you want to post about?
        <textarea required rows={3} value={v.brief} onChange={(e) => set("brief", e.target.value)} placeholder="e.g. Why families flying in love that we're 15 minutes from the airport" className={`${field} text-base`} />
      </label>
      <ul className="flex flex-wrap gap-1.5" aria-label="Ideas">
        {IDEAS.map((i) => <li key={i}><button type="button" onClick={() => set("brief", i)} className="rounded-full bg-ivory-100 px-3 py-1 text-xs text-ink-soft hover:bg-ivory-200">{i}</button></li>)}
      </ul>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Format">
        {FORMATS.map(([k, l]) => <button key={k} type="button" aria-pressed={v.type === k} onClick={() => set("type", k)} className={`rounded-full px-4 py-1.5 text-sm ring-1 ${v.type === k ? "bg-sage-700 text-white ring-sage-700" : "bg-white ring-line"}`}>{l}</button>)}
      </div>
      <details className="rounded-2xl border border-line bg-white p-3">
        <summary className="cursor-pointer text-sm text-sage-700">More options</summary>
        <div className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={label}>Pillar<select value={v.pillar} onChange={(e) => set("pillar", e.target.value)} className={field}><option value="">Any</option>{pillars.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
            {v.type === "carousel" ? <label className={label}>Slides<select value={v.slides} onChange={(e) => set("slides", e.target.value)} className={field}>{[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select></label> : null}
            {v.type === "reel" ? <label className={label}>Length<select value={v.seconds} onChange={(e) => set("seconds", e.target.value)} className={field}>{[15, 30, 45, 60].map((n) => <option key={n} value={n}>{n} seconds</option>)}</select></label> : null}
            {v.type === "carousel" || v.type === "single_post" ? <label className={label}>Shape<select value={v.aspect} onChange={(e) => set("aspect", e.target.value)} className={field}><option value="4:5">Portrait 4:5</option><option value="1:1">Square 1:1</option></select></label> : null}
            {v.type !== "reel" ? <label className={label}>Colours<select value={v.scheme} onChange={(e) => set("scheme", e.target.value)} className={field}><option value="light">Warm white, olive type</option><option value="dark">Olive, ivory type</option></select></label> : null}
            <label className={label}>Post on<input type="date" value={v.scheduledFor} onChange={(e) => set("scheduledFor", e.target.value)} className={field} /></label>
          </div>
          <label className={label}>Creative direction<input value={v.direction} onChange={(e) => set("direction", e.target.value)} placeholder="e.g. golden hour, calm and warm, lead with the lawn" className={field} /></label>
          {photos.length ? (
            <fieldset>
              <legend className={label}>Use these photos (otherwise the studio picks)</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!space} onClick={() => setSpace("")} className={`rounded-full px-3 py-1 text-xs ring-1 ${!space ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>All spaces</button>
                {areas.map((a) => <button key={a.id} type="button" aria-pressed={space === a.id} onClick={() => setSpace(a.id)} className={`rounded-full px-3 py-1 text-xs ring-1 ${space === a.id ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>{a.name}</button>)}
              </div>
              {shown.length === 0 ? <p className="mt-2 text-sm text-ink-soft">No photos for this space yet. Add some in Library.</p> : null}
              <ul className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                {shown.map((p) => {
                  const on = v.assetIds.includes(p.id);
                  return <li key={p.id}><button type="button" aria-pressed={on} title={p.title} onClick={() => set("assetIds", on ? v.assetIds.filter((x) => x !== p.id) : [...v.assetIds, p.id])} className={`relative block aspect-square w-full overflow-hidden rounded-lg ring-2 ${on ? "ring-sage-700" : "ring-transparent"}`}>{p.url ? <img src={p.url} alt="" loading="lazy" className="size-full object-cover" /> : null}{p.kind === "video" ? <span className="absolute bottom-0.5 left-0.5 rounded bg-ink/70 px-1 text-[10px] text-white">clip</span> : null}{on ? <span className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-sage-700 text-xs text-white">✓</span> : null}</button></li>;
                })}
              </ul>
            </fieldset>
          ) : <p className="text-sm text-ink-soft">The library is empty: add photos in Library so posts can show the estate.</p>}
        </div>
      </details>
      <div className="flex items-center gap-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Starting…" : "Create"}</button>
        <span className="text-xs text-ink-soft">The studio writes the script; you approve it and it's made.</span>
        {error ? <span role="alert" className="text-sm text-burgundy-700">{error}</span> : null}
      </div>
    </form>
  );
}
