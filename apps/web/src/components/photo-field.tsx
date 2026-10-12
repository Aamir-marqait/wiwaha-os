"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_MB = 8;

/** Uploads to the public "library" bucket and returns the photo's link. */
async function upload(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo.");
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Photos must be under ${MAX_MB} MB.`);
  const supabase = createClient();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("library").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return supabase.storage.from("library").getPublicUrl(path).data.publicUrl;
}

/** One photo (value = its link) or several (value = links, one per line). */
export function PhotoField({ label, value, multiple, onChange }: { label: string; value: string; multiple?: boolean; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = value.split(/\s+/).filter(Boolean);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try {
      const got: string[] = [];
      for (const f of Array.from(files).slice(0, multiple ? 12 : 1)) got.push(await upload(f));
      onChange(multiple ? [...urls, ...got].join("\n") : got[0]!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sm:col-span-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      {urls.length ? (
        <ul className="mt-1 flex flex-wrap gap-2">
          {urls.map((u) => (
            <li key={u} className="relative">
              <img src={u} alt="" className="size-20 rounded-lg border border-line object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => onChange(urls.filter((x) => x !== u).join("\n"))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-burgundy-600 text-xs text-white">×</button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-full bg-sage-100 px-3 py-1.5 text-sm font-medium text-sage-800">
        <input type="file" accept="image/*" multiple={multiple} className="sr-only" disabled={busy} onChange={(e) => void add(e.target.files)} />
        {busy ? "Uploading…" : multiple ? "Add photos" : urls.length ? "Replace photo" : "Upload photo"}
      </label>
      {error ? <p role="alert" className="mt-1 text-xs text-burgundy-700">{error}</p> : null}
    </div>
  );
}
