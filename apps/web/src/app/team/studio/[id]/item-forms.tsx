"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { approveItem, discardItem, editSlide, requestChange, restoreItem, saveScript, writeMyself, type ScriptEdit } from "../actions";

const field = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm normal-case tracking-normal";
const label = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

/** Reloads the page every few seconds while something is being written or rendered. */
export function AutoRefresh({ seconds = 6 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => router.refresh(), seconds * 1000); return () => clearInterval(t); }, [router, seconds]);
  return null;
}

export function ScriptEditor({ id, status, initial, format, wordsHint }: { id: string; status: string; initial: ScriptEdit; format: string; wordsHint: string | null }) {
  const router = useRouter();
  const [v, setV] = useState<ScriptEdit>(initial);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const editable = ["draft", "failed", "generated"].includes(status);
  const run = (fn: () => Promise<{ error?: string }>, ok?: string) => start(async () => { const r = await fn(); setMsg(r.error ? { ok: false, text: r.error } : ok ? { ok: true, text: ok } : null); if (!r.error) router.refresh(); });
  const words = v.script.split(/\s+/).filter(Boolean).length;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveScript(id, v), "Saved."); }}>
      <fieldset disabled={!editable || pending} className="space-y-3">
        <label className={label}>Working title<input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className={field} /></label>
        <label className={label}>Hook<input value={v.hook} onChange={(e) => setV({ ...v, hook: e.target.value })} className={field} /></label>
        <label className={label}>{format === "reel" ? "Voiceover" : format === "carousel" ? "Slides (one per line: Slide N — Headline | supporting line)" : "On-image words (Headline | supporting line)"}
          <textarea rows={format === "carousel" ? 9 : 6} value={v.script} onChange={(e) => setV({ ...v, script: e.target.value })} className={`${field} font-mono text-[13px] leading-6`} />
        </label>
        {format === "reel" ? <p className="text-xs text-ink-soft">{words} words{wordsHint ? ` · ${wordsHint}` : ""}. The phone number is never spoken: the reel shows it on screen.</p> : null}
        <label className={label}>Caption<textarea rows={5} value={v.caption} onChange={(e) => setV({ ...v, caption: e.target.value })} className={field} /></label>
        <label className={label}>Hashtags<input value={v.hashtags} onChange={(e) => setV({ ...v, hashtags: e.target.value })} className={field} /></label>
      </fieldset>
      {status === "drafting" ? <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft"><span>The studio is writing…</span><button type="button" onClick={() => run(() => writeMyself(id))} className={buttonClass("ghost", "sm")}>Write it myself</button></div> : null}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={pending} className={buttonClass("secondary", "md")}>{pending ? "Saving…" : "Save edits"}</button>
          <button type="button" disabled={pending} onClick={() => run(async () => { const s = await saveScript(id, v); return s.error ? s : approveItem(id); })} className={buttonClass("primary", "md")}>{status === "draft" ? "Approve and render" : "Render again"}</button>
          {status === "draft" || status === "failed" ? <button type="button" onClick={() => setAsking((x) => !x)} className={buttonClass("ghost", "md")}>Request a change</button> : null}
          <button type="button" disabled={pending} onClick={() => { if (window.confirm("Discard this script?")) run(() => discardItem(id)); }} className={buttonClass("ghost", "md")}>Discard</button>
        </div>
      ) : null}
      {status === "discarded" ? <button type="button" onClick={() => run(() => restoreItem(id))} className={buttonClass("secondary", "md")}>Restore</button> : null}
      {asking ? (
        <div className="space-y-2 rounded-xl border border-line bg-ivory-50 p-3">
          <label className={label}>What should change?<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Warmer, and lead with the rooms" className={field} /></label>
          <button type="button" disabled={pending} onClick={() => run(() => requestChange(id, note), "Rewriting…")} className={buttonClass("primary", "sm")}>Rewrite</button>
        </div>
      ) : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-sage-700" : "text-sm text-burgundy-700"}>{msg.text}</p> : null}
    </form>
  );
}

/** Change one finished slide's words or photo. */
export function SlideEdit({ itemId, idx, initial, photos, edits, limit }: { itemId: string; idx: number; initial: { headline: string; support: string; kicker: string; assetId: string | null }; photos: { id: string; url: string }[]; edits: number; limit: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" disabled={edits >= limit} onClick={() => setOpen(true)} className={buttonClass("ghost", "sm")}>{edits >= limit ? "No edits left" : `Edit (${limit - edits} left)`}</button>;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await editSlide(itemId, idx, { ...v, assetId: photo }); if (r.error) setError(r.error); else { setOpen(false); router.refresh(); } }); }}>
      <label className={label}>Kicker<input value={v.kicker} onChange={(e) => setV({ ...v, kicker: e.target.value })} className={field} /></label>
      <label className={label}>Headline<input value={v.headline} onChange={(e) => setV({ ...v, headline: e.target.value })} className={field} /></label>
      <label className={label}>Supporting line<input value={v.support} onChange={(e) => setV({ ...v, support: e.target.value })} className={field} /></label>
      <p className={label}>Photo</p>
      <ul className="grid grid-cols-5 gap-1">
        <li><button type="button" onClick={() => setPhoto("")} className={`grid aspect-square w-full place-items-center rounded-md bg-ivory-100 text-[10px] ring-2 ${photo === "" ? "ring-sage-700" : "ring-transparent"}`}>No photo</button></li>
        {photos.slice(0, 29).map((p) => <li key={p.id}><button type="button" onClick={() => setPhoto(p.id)} className={`block aspect-square w-full overflow-hidden rounded-md ring-2 ${photo === p.id ? "ring-sage-700" : "ring-transparent"}`}><img src={p.url} alt="" loading="lazy" className="size-full object-cover" /></button></li>)}
      </ul>
      <div className="flex gap-1.5"><button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Setting…" : "Set slide again"}</button><button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button></div>
      {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
    </form>
  );
}
