"use server";
import { openDecorQuestionnaire } from "@wiwaha/agents";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { agentDeps, runRouting } from "@/lib/agents";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { kickMediaWorker } from "@/lib/media/kick";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };
const DECOR = ["owner", "event_manager"] as const;
const done = (weddingId: string, error?: { message?: string; code?: string } | null): Result => {
  revalidatePath(`/team/weddings/${weddingId}`);
  return error ? { error: friendlyError(error) } : {};
};

/** (Re)send the décor questionnaire to the couple. */
export async function sendDecorQuestionnaire(weddingId: string): Promise<Result> {
  await requireStaff(DECOR);
  const out = await openDecorQuestionnaire(agentDeps(), weddingId);
  if (out.status === "error") return { error: out.error };
  if (out.status === "done" && !out.result.opened) return { error: "The couple has already sent their questionnaire. Use \"Start over\" to let them change it." };
  return done(weddingId);
}

/** Make the AI moodboards now from whatever the couple has answered (or nothing yet). */
export async function makeMoodboardsNow(weddingId: string): Promise<Result> {
  await requireStaff(DECOR);
  const supabase = await createClient("team");
  const { data: b } = await supabase.from("decor_briefs").select("answers").eq("wedding_id", weddingId).maybeSingle();
  const { error } = await supabase.rpc("save_decor_brief", { p_wedding: weddingId, p_answers: b?.answers ?? {}, p_submit: true });
  if (!error) after(runRouting);
  return done(weddingId, error);
}

/** Remove the AI boards the couple hasn't seen yet and reopen the questionnaire. */
export async function startMoodboardsOver(weddingId: string): Promise<Result> {
  await requireStaff(DECOR);
  const supabase = await createClient("team");
  const { error } = await supabase.from("moodboards").delete().eq("wedding_id", weddingId).eq("source", "ai").is("shared_at", null);
  if (error) return done(weddingId, error);
  const { error: e2 } = await supabase.from("decor_briefs").update({ status: "open" }).eq("wedding_id", weddingId);
  return done(weddingId, e2);
}

/** Redo one picture, with a note for the image model. */
export async function redoSlide(weddingId: string, slideId: string, note: string): Promise<Result> {
  await requireStaff(DECOR);
  const supabase = await createClient("team");
  const { data: s } = await supabase.from("moodboard_slides").select("prompt, redo_count, engine, base_url").eq("id", slideId).maybeSingle();
  if (!s) return { error: "Slide not found." };
  if (!s.base_url) return { error: "This area has no plain photo yet. Add one in Décor → Venue areas first." };
  const base = String(s.prompt ?? "").split(" The team asked for these changes:")[0]!.split(" The couple asked for these changes:")[0]!;
  const n = note.trim();
  const { error } = await supabase.from("moodboard_slides").update({
    status: "queued", engine: "ai", error: null, redo_count: Number(s.redo_count ?? 0) + 1,
    prompt: n ? `${base} The team asked for these changes: "${n.replace(/"/g, "'").slice(0, 400)}". Keep the place exactly as it is.` : base,
  }).eq("id", slideId);
  if (!error) after(() => kickMediaWorker());
  return done(weddingId, error);
}

/** Use an edited picture (made elsewhere) in place of the generated one; empty to go back. */
export async function setEditedSlide(weddingId: string, slideId: string, url: string): Promise<Result> {
  const viewer = await requireStaff(DECOR);
  const u = url.trim();
  if (u && !/^https:\/\/\S+$/.test(u)) return { error: "Upload a photo." };
  const supabase = await createClient("team");
  const { error } = await supabase.from("moodboard_slides").update({ edited_url: u || null, edited_by: u ? viewer.userId : null, status: "ready", error: null }).eq("id", slideId);
  return done(weddingId, error);
}

/** An edited deck (PDF) the couple sees in place of ours. */
export async function setDeckPdf(weddingId: string, moodboardId: string, url: string): Promise<Result> {
  await requireStaff(DECOR);
  const u = url.trim();
  if (u && !/^https:\/\/\S+\.pdf(\?\S*)?$/i.test(u)) return { error: "Upload a PDF." };
  const supabase = await createClient("team");
  const { error } = await supabase.from("moodboards").update({ deck_url: u || null }).eq("id", moodboardId);
  return done(weddingId, error);
}

/**
 * Share the AI boards with the couple. If the Design assistant asked for a
 * review, this approves that request (which also messages the couple).
 */
export async function shareMoodboards(weddingId: string): Promise<Result> {
  await requireStaff(DECOR);
  const supabase = await createClient("team");
  const { data: boards } = await supabase.from("moodboards").select("id, approval_id").eq("wedding_id", weddingId).eq("source", "ai").is("shared_at", null);
  if (!boards?.length) return { error: "Nothing waiting to be shared." };
  const { data: slides } = await supabase.from("moodboard_slides").select("status").in("moodboard_id", boards.map((b) => b.id as string));
  if ((slides ?? []).some((s) => s.status === "queued" || s.status === "rendering")) return { error: "Some pictures are still being made. Share once they're ready." };
  const approvalId = boards.find((b) => b.approval_id)?.approval_id as string | undefined;
  if (approvalId) {
    const { data: a } = await supabase.from("approvals").select("status").eq("id", approvalId).maybeSingle();
    if (a?.status === "pending") {
      const { error } = await supabase.rpc("decide_approval", { p_approval_id: approvalId, p_decision: "approved", p_edited_payload: null, p_note: "Shared from the Wedding Room" });
      if (!error) after(runRouting);
      return done(weddingId, error);
    }
  }
  const { error } = await supabase.from("moodboards").update({ shared_at: new Date().toISOString() }).in("id", boards.map((b) => b.id as string));
  return done(weddingId, error);
}
