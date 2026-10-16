import { formatDateIST } from "@wiwaha/db";
import { NextResponse, type NextRequest } from "next/server";
import { buildMoodboardPdf, type DeckSlide } from "@/lib/media/deck-pdf";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * A moodboard as a PDF (cover, the function's page, each space as it is and
 * dressed). Read as the signed-in person, so row-level security decides:
 * the team, or the couple once the board is shared. ?all=1 adds every AI
 * board of the wedding to one deck.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient("portal");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: board } = await supabase.from("moodboards").select("id, wedding_id, function_id, theme, description, palette, source").eq("id", id).maybeSingle();
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const all = req.nextUrl.searchParams.get("all") === "1";
  const { data: boards } = all
    ? await supabase.from("moodboards").select("id, wedding_id, function_id, theme, description, palette, source").eq("wedding_id", board.wedding_id).eq("source", "ai").order("created_at")
    : { data: [board] };
  const ids = (boards ?? []).map((b) => b.id as string);
  const [{ data: w }, { data: fns }, { data: slides }, { data: policy }] = await Promise.all([
    supabase.from("weddings").select("title").eq("id", board.wedding_id).maybeSingle(),
    supabase.from("event_functions").select("id, name, date, start_time, guest_count").eq("wedding_id", board.wedding_id),
    supabase.from("moodboard_slides").select("moodboard_id, area_name, element, caption, base_url, result_url, edited_url, engine, status, sort").in("moodboard_id", ids).order("sort"),
    supabase.from("policies").select("value").eq("key", "decor.ai_moodboards").maybeSingle(),
  ]);
  const fnById = new Map((fns ?? []).map((f) => [f.id as string, f]));
  const pdf = await buildMoodboardPdf({
    couple: (w?.title as string | undefined) ?? "Your wedding",
    palette: ((board.palette ?? []) as string[]),
    labelAi: (policy?.value as { label_ai_images?: boolean } | null)?.label_ai_images !== false,
    functions: (boards ?? []).map((b) => {
      const f = fnById.get(b.function_id as string);
      const mine = (slides ?? []).filter((s) => s.moodboard_id === b.id && s.status === "ready");
      const time = f?.start_time ? (Number(String(f.start_time).slice(0, 2)) < 12 ? "MORNING" : Number(String(f.start_time).slice(0, 2)) < 17 ? "AFTERNOON" : "EVENING") : "";
      return {
        name: (f?.name as string | undefined) ?? "Function",
        dateLabel: [f?.date ? formatDateIST(f.date as string, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase() : "", time].filter(Boolean).join(" · "),
        areas: [...new Set(mine.map((s) => s.area_name as string))],
        guests: (f?.guest_count as number | null) ?? null,
        theme: b.theme as string,
        description: (b.description as string | null) ?? null,
        slides: mine.map((s): DeckSlide => ({ areaName: s.area_name as string, element: s.element as string, caption: (s.caption as string | null) ?? null, baseUrl: (s.base_url as string | null) ?? null, imageUrl: ((s.edited_url ?? s.result_url) as string | null) ?? null, ai: s.engine === "ai" && !s.edited_url })),
      };
    }),
  });
  const name = `${String(w?.title ?? "moodboard").replace(/[^\w&]+/g, "-")}-moodboard.pdf`;
  return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
}
