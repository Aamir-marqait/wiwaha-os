"use server";
import type { Json } from "@wiwaha/db";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function decide(approvalId: string, decision: "approved" | "edited" | "rejected", editedBody: string | null, note: string | null): Promise<{ error?: string }> {
  await requireStaff();
  const supabase = await createClient("team");
  let edited: Json | null = null;
  if (decision === "edited") {
    const { data } = await supabase.from("approvals").select("payload").eq("id", approvalId).maybeSingle();
    const payload = (data?.payload ?? {}) as Record<string, Json>;
    if (!editedBody?.trim()) return { error: "The edited message is empty." };
    edited = { ...payload, body: editedBody.trim() };
  }
  const { error } = await supabase.rpc("decide_approval", { p_approval_id: approvalId, p_decision: decision, p_edited_payload: edited, p_note: note?.trim() || null });
  revalidatePath("/team/approvals");
  revalidatePath("/team", "layout");
  return error ? { error: friendlyError(error) } : {};
}
