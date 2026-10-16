import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import { MEDIA_BUCKET } from "./config";

/** Server-side uploads to the public media bucket (rendered slides, reels, moodboard pictures). */
export async function putMedia(path: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
  const admin = createAdminClient("agent");
  const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return admin.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** A fresh, unguessable path under a prefix. */
export function mediaPath(prefix: string, ext: string): string {
  return `${prefix.replace(/\/+$/, "")}/${randomUUID()}.${ext.replace(/^\./, "")}`;
}

const ALLOWED_HOSTS = [/\.supabase\.co$/, /\.fal\.media$/, /^fal\.media$/, /\.fal\.run$/, /\.fal\.ai$/, /^v3\.fal\.media$/, /\.googleapis\.com$/];

/** Download a file we stored or fal produced. Other hosts are refused (no SSRF through the worker). */
export async function fetchMedia(url: string, maxBytes = 200 * 1024 * 1024): Promise<Buffer> {
  const u = new URL(url);
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  const ok = u.protocol === "https:" && (u.hostname === supabaseHost || ALLOWED_HOSTS.some((r) => r.test(u.hostname)));
  if (!ok) throw new Error(`Refusing to fetch media from ${u.hostname}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Couldn't fetch media (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new Error("That file is too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("That file is too large");
  return buf;
}
