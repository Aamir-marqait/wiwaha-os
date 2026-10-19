"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerMedia, type UploadedMedia } from "@/app/team/media/actions";
import { createClient } from "@/lib/supabase/client";

const MAX_IMAGE_MB = 25;
const MAX_VIDEO_MB = 50;

function measureImage(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** A clip's length and size, and a still from one second in (for the library grid and the AI librarian). */
function measureVideo(file: File): Promise<{ width: number; height: number; durationMs: number; still: Blob | null } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true;
    const done = (r: Awaited<ReturnType<typeof measureVideo>>) => { URL.revokeObjectURL(url); resolve(r); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => done({ width: v.videoWidth, height: v.videoHeight, durationMs: Math.round(v.duration * 1000), still: b }), "image/jpeg", 0.85);
    };
    v.onerror = () => done(null);
    v.src = url;
  });
}

/** Upload photos (and clips, where allowed) straight to the library. */
export function MediaUploader({ folderId, areaId, look, videos = true, label }: { folderId?: string | null; areaId?: string | null; look?: string; videos?: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const supabase = createClient();
    const month = new Date().toISOString().slice(0, 7);
    const out: UploadedMedia[] = [];
    const files = Array.from(list).slice(0, 30);
    let saved = false;
    try {
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const isVideo = f.type.startsWith("video/");
        if (!isVideo && !/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error(`${f.name}: use JPG, PNG or WebP photos${videos ? ", or MP4 clips" : ""}.`);
        if (isVideo && !videos) throw new Error(`${f.name}: only photos here.`);
        if (f.size > (isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB) * 1024 * 1024) throw new Error(`${f.name} is over ${isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB} MB.`);
        const ext = (f.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `library/${month}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, f, { contentType: f.type, cacheControl: "31536000" });
        if (upErr) throw new Error(`${f.name}: ${upErr.message}`);
        const url = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
        let width: number | null = null, height: number | null = null, durationMs: number | null = null, thumbUrl: string | null = null;
        if (isVideo) {
          const m = await measureVideo(f);
          if (m) {
            ({ width, height, durationMs } = m);
            if (m.still) {
              const tp = `library/${month}/${crypto.randomUUID()}-still.jpg`;
              const { error: tErr } = await supabase.storage.from("media").upload(tp, m.still, { contentType: "image/jpeg" });
              if (!tErr) thumbUrl = supabase.storage.from("media").getPublicUrl(tp).data.publicUrl;
            }
          }
        } else {
          const m = await measureImage(f);
          if (m) ({ width, height } = m);
        }
        out.push({ path, url, kind: isVideo ? "video" : "image", contentType: f.type, bytes: f.size, width, height, durationMs, thumbUrl, title: f.name });
      }
      setBusy("Saving…");
      const r = await registerMedia(out, { folderId: folderId ?? null, areaId: areaId ?? null, look: look ?? null });
      saved = true;
      if (r.error) throw new Error(r.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      // Keep whatever did upload before the problem.
      if (!saved && out.length) { await registerMedia(out, { folderId: folderId ?? null, areaId: areaId ?? null, look: look ?? null }); router.refresh(); }
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={`${buttonClass("primary", "md")} cursor-pointer`}>
        <input type="file" multiple accept={videos ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp"} className="sr-only" disabled={!!busy} onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        {busy ?? label ?? (videos ? "Upload photos or clips" : "Upload photos")}
      </label>
      <span className="text-xs text-ink-soft">Photos up to {MAX_IMAGE_MB} MB{videos ? `, clips up to ${MAX_VIDEO_MB} MB` : ""}. Several at once is fine.</span>
      {error ? <p role="alert" className="w-full text-sm text-burgundy-700">{error}</p> : null}
    </div>
  );
}
