import { zipSync, strToU8 } from "fflate";
import { NextResponse, type NextRequest } from "next/server";
import { fetchMedia } from "@/lib/media/storage";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** The finished slides (or reel) plus the caption, as one zip to post from a phone or laptop. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient("team");
  const { data: item } = await supabase.from("studio_items").select("title, content_type, caption, hashtags, outputs").eq("id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const out = (item.outputs ?? {}) as { slides?: string[]; video_url?: string };
  const files: Record<string, Uint8Array> = {};
  const caption = [item.caption as string | null, ((item.hashtags ?? []) as string[]).join(" ")].filter(Boolean).join("\n\n");
  files["caption.txt"] = strToU8(caption);
  const slides = (out.slides ?? []).filter(Boolean);
  for (const [i, url] of slides.entries()) files[`slide-${String(i + 1).padStart(2, "0")}.jpg`] = new Uint8Array(await fetchMedia(url));
  if (out.video_url) files["reel.mp4"] = new Uint8Array(await fetchMedia(out.video_url));
  if (!slides.length && !out.video_url) return NextResponse.json({ error: "Nothing rendered yet" }, { status: 409 });
  const zip = zipSync(files, { level: 0 });
  const name = `${String(item.title ?? "post").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "post"}.zip`;
  return new NextResponse(Buffer.from(zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
}
