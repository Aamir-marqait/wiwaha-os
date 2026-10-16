"use server";
import { MEDIA_LOOKS, type MediaLook } from "@wiwaha/db";
import { describeMediaAsset } from "@wiwaha/agents";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { agentDeps } from "@/lib/agents";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };
const EDITORS = ["owner", "sales", "event_manager", "staff"] as const;
const isLook = (v: unknown): v is MediaLook => typeof v === "string" && (MEDIA_LOOKS as readonly string[]).includes(v);
const refresh = () => { revalidatePath("/team/studio", "layout"); revalidatePath("/team/decor", "layout"); };

export interface UploadedMedia {
  path: string; url: string; kind: "image" | "video"; contentType: string; bytes: number;
  width: number | null; height: number | null; durationMs: number | null; thumbUrl: string | null; title: string;
}

/**
 * Files were uploaded straight to the media bucket from the browser; this
 * records them in the library and asks the Content Studio to describe each.
 */
export async function registerMedia(files: UploadedMedia[], opts: { folderId?: string | null; areaId?: string | null; look?: string | null; angle?: string | null }): Promise<Result & { ids?: string[] }> {
  await requireStaff(EDITORS);
  if (!files.length) return { error: "Choose some photos or clips." };
  const supabase = await createClient("team");
  const look = isLook(opts.look) ? opts.look : "other";
  const rows = files.slice(0, 40).map((f) => ({
    kind: f.kind === "video" ? "video" : "image",
    path: f.path, url: f.url, thumb_url: f.thumbUrl, content_type: f.contentType, bytes: f.bytes,
    width: f.width, height: f.height, duration_ms: f.durationMs,
    title: f.title.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 80) || null,
    folder_id: opts.folderId || null, venue_area_id: opts.areaId || null,
    look: f.kind === "video" && look === "plain" ? "other" : look, angle: opts.angle?.trim() || null,
    status: f.kind === "video" && !f.durationMs ? "failed" : "ready",
    status_error: f.kind === "video" && !f.durationMs ? "We couldn't read this clip's length. Try an MP4 from your phone." : null,
  }));
  const { data, error } = await supabase.from("media_assets").insert(rows).select("id, kind, look, venue_area_id");
  if (error) return { error: friendlyError(error) };
  const ids = (data ?? []).map((r) => r.id as string);
  // The first plain photo of an area becomes its main base photo.
  if (opts.areaId && look === "plain") {
    const { count } = await supabase.from("media_assets").select("id", { count: "exact", head: true }).eq("venue_area_id", opts.areaId).eq("is_primary", true);
    const first = (data ?? []).find((r) => r.kind === "image");
    if (!count && first) await supabase.rpc("set_primary_media", { p_asset: first.id });
  }
  after(async () => {
    const deps = agentDeps();
    for (const id of ids.slice(0, 20)) await describeMediaAsset(deps, id);
  });
  refresh();
  return { ids };
}

export async function updateMedia(id: string, patch: { title?: string; description?: string; tags?: string; look?: string; areaId?: string | null; angle?: string; folderId?: string | null }): Promise<Result> {
  await requireStaff(EDITORS);
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim().slice(0, 80) || null;
  if (patch.description !== undefined) { row.description = patch.description.trim().slice(0, 500) || null; row.described_by = "staff"; }
  if (patch.tags !== undefined) row.tags = patch.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 16);
  if (patch.look !== undefined && isLook(patch.look)) row.look = patch.look;
  if (patch.areaId !== undefined) row.venue_area_id = patch.areaId || null;
  if (patch.angle !== undefined) row.angle = patch.angle.trim().slice(0, 60) || null;
  if (patch.folderId !== undefined) row.folder_id = patch.folderId || null;
  if (row.venue_area_id === null) row.is_primary = false;
  const supabase = await createClient("team");
  const { error } = await supabase.from("media_assets").update(row).eq("id", id);
  refresh();
  return error ? { error: friendlyError(error) } : {};
}

/** Removes the photo from the library (and storage). A photo already used in a moodboard keeps showing there. */
export async function deleteMedia(id: string): Promise<Result> {
  await requireStaff(["owner", "sales", "event_manager"]);
  const supabase = await createClient("team");
  const { data: a } = await supabase.from("media_assets").select("path, thumb_url").eq("id", id).maybeSingle();
  const { error } = await supabase.from("media_assets").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  if (a?.path) await supabase.storage.from("media").remove([a.path as string]);
  refresh();
  return {};
}

export async function setPrimaryMedia(id: string): Promise<Result> {
  await requireStaff(["owner", "event_manager", "staff"]);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("set_primary_media", { p_asset: id });
  refresh();
  return error ? { error: friendlyError(error) } : {};
}

export async function createFolder(name: string, parentId: string | null): Promise<Result> {
  await requireStaff(EDITORS);
  const n = name.trim();
  if (!n) return { error: "Name the folder." };
  const supabase = await createClient("team");
  const { error } = await supabase.from("media_folders").insert({ name: n.slice(0, 80), parent_id: parentId || null });
  refresh();
  return error ? { error: error.code === "23505" ? "There's already a folder with that name here." : friendlyError(error) } : {};
}

export async function deleteFolder(id: string): Promise<Result> {
  await requireStaff(EDITORS);
  const supabase = await createClient("team");
  const { error } = await supabase.rpc("delete_media_folder", { p_id: id });
  refresh();
  return error ? { error: friendlyError(error) } : {};
}

export interface AreaInput { name: string; kind: string; description: string; suits: string[]; spaceId: string | null; sort: string; active: boolean }
const KINDS = ["entrance", "pathway", "lawn", "hall", "poolside", "amphitheatre", "courtyard", "rooms", "other"];
const FUNCTION_TYPES = ["haldi", "mehendi", "sangeet", "wedding", "reception", "engagement", "cocktail", "pooja", "other"];

/** Add or edit a venue area (the spaces décor is planned for). */
export async function saveArea(id: string | null, a: AreaInput): Promise<Result & { id?: string }> {
  await requireStaff(["owner", "event_manager", "staff"]);
  const name = a.name.trim();
  if (name.length < 2) return { error: "Name the area." };
  const row = {
    name: name.slice(0, 80), kind: KINDS.includes(a.kind) ? a.kind : "other", description: a.description.trim().slice(0, 600) || null,
    suits: a.suits.filter((s) => FUNCTION_TYPES.includes(s)), space_id: a.spaceId || null, sort: Number(a.sort) || 100, active: a.active,
  };
  const supabase = await createClient("team");
  const { data, error } = id ? await supabase.from("venue_areas").update(row).eq("id", id).select("id").single() : await supabase.from("venue_areas").insert(row).select("id").single();
  refresh();
  return error ? { error: error.code === "23505" ? "There's already an area with that name." : friendlyError(error) } : { id: data?.id as string };
}
