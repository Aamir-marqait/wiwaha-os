"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runRouting } from "@/lib/agents";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/** Add a Google / WedMeGood review by hand (until a listings feed is connected). */
export async function addReview(form: FormData): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const platform = String(form.get("platform"));
  const rating = Number(form.get("rating"));
  const body = String(form.get("body") ?? "").trim();
  if (!["google", "wedmegood"].includes(platform) || !(rating >= 1 && rating <= 5) || !body) return { error: "Pick the platform, a rating and paste the review." };
  const db = createAdminClient("system");
  const { data, error } = await db.from("external_reviews").insert({ platform, external_id: `manual-${Date.now()}`, author_name: String(form.get("author") ?? "").trim() || null, rating, body, posted_at: new Date().toISOString() }).select("id").single();
  if (error) return { error: friendlyError(error) };
  await db.from("agent_tasks").insert({ kind: "external_review", payload: { review_id: data.id } });
  after(async () => { await runRouting(); });
  revalidatePath("/team/sales");
  return {};
}

export async function markReplyPosted(reviewId: string): Promise<{ error?: string }> {
  await requireStaff(["owner", "sales"]);
  const { error } = await createAdminClient("system").from("external_reviews").update({ reply_status: "posted" }).eq("id", reviewId).eq("reply_status", "approved");
  revalidatePath("/team/sales");
  return error ? { error: friendlyError(error) } : {};
}
