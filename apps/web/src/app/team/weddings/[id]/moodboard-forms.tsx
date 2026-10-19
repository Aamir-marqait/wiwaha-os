"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PhotoField } from "@/components/photo-field";
import { createClient } from "@/lib/supabase/client";
import { redoSlide, setDeckPdf, setEditedSlide } from "./moodboard-actions";

const field = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";

/** Per slide: redo with a note, or use an edited picture made elsewhere. */
export function SlideActions({ weddingId, slideId, edited, canRedo }: { weddingId: string; slideId: string; edited: string | null; canRedo: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "redo" | "edit">("none");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState(edited ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { const r = await fn(); if (r.error) setError(r.error); else { setError(null); setMode("none"); router.refresh(); } });
  if (mode === "redo") return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => redoSlide(weddingId, slideId, note)); }}>
      <label className="block text-xs text-ink-soft">What should change?<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. More marigold, brass lamps on the steps" className={field} /></label>
      <div className="flex gap-1.5"><button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Queuing…" : "Redo picture"}</button><button type="button" onClick={() => setMode("none")} className={buttonClass("ghost", "sm")}>Cancel</button></div>
      {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
    </form>
  );
  if (mode === "edit") return (
    <div className="space-y-2">
      <PhotoField label="Edited picture" value={url} onChange={setUrl} />
      <div className="flex gap-1.5">
        <button type="button" disabled={pending} onClick={() => run(() => setEditedSlide(weddingId, slideId, url))} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : "Use this picture"}</button>
        {edited ? <button type="button" disabled={pending} onClick={() => run(() => setEditedSlide(weddingId, slideId, ""))} className={buttonClass("ghost", "sm")}>Go back to the AI picture</button> : null}
        <button type="button" onClick={() => setMode("none")} className={buttonClass("ghost", "sm")}>Cancel</button>
      </div>
      {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
    </div>
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {canRedo ? <button type="button" onClick={() => setMode("redo")} className={buttonClass("secondary", "sm")}>Redo</button> : null}
      <button type="button" onClick={() => setMode("edit")} className={buttonClass("ghost", "sm")}>{edited ? "Change edited picture" : "Upload edited"}</button>
    </div>
  );
}

/** Upload an edited deck (PDF) for the couple to see instead of ours. */
export function DeckUpload({ weddingId, moodboardId, current }: { weddingId: string; moodboardId: string; current: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "application/pdf") { setError("Choose a PDF."); return; }
    if (f.size > 40 * 1024 * 1024) { setError("PDFs must be under 40 MB."); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const path = `decks/${weddingId}/${crypto.randomUUID()}.pdf`;
    const { error: up } = await supabase.storage.from("media").upload(path, f, { contentType: "application/pdf" });
    if (up) { setError(up.message); setBusy(false); return; }
    const r = await setDeckPdf(weddingId, moodboardId, supabase.storage.from("media").getPublicUrl(path).data.publicUrl);
    setBusy(false);
    if (r.error) setError(r.error); else router.refresh();
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <label className={`${buttonClass("ghost", "sm")} cursor-pointer`}>
        <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
        {busy ? "Uploading…" : current ? "Replace edited PDF" : "Upload edited PDF"}
      </label>
      {current ? <button type="button" onClick={async () => { await setDeckPdf(weddingId, moodboardId, ""); router.refresh(); }} className={buttonClass("ghost", "sm")}>Remove edited PDF</button> : null}
      {error ? <span role="alert" className="text-xs text-burgundy-700">{error}</span> : null}
    </span>
  );
}
