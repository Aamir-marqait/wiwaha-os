"use server";
import type { AgentAutonomy } from "@wiwaha/db";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const MODELS = ["claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"];

export async function updateAgent(key: string, patch: { enabled?: boolean; autonomy?: AgentAutonomy; model?: string }): Promise<{ error?: string }> {
  const viewer = await requireStaff(["owner"]);
  if (patch.model && !MODELS.includes(patch.model)) return { error: "Unknown model" };
  const supabase = await createClient("team");
  const { data, error } = await supabase.from("agents").update({ ...patch, updated_by: viewer.userId }).eq("key", key).select("key").maybeSingle();
  revalidatePath("/team/settings/agents");
  if (error) return { error: friendlyError(error) };
  if (!data) return { error: "Only the owner can change agents." };
  return {};
}
