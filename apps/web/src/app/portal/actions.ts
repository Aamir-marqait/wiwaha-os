"use server";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** The couple presses Start. The database enforces the payment unlock and logs the edit with IP. */
export async function startStage(stageId: string): Promise<{ error?: string }> {
  await requireClient();
  const supabase = await createClient("portal");
  const { error } = await supabase.rpc("start_stage", { p_stage_id: stageId });
  revalidatePath("/portal");
  return error ? { error: friendlyError(error) } : {};
}
