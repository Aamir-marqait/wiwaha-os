"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { revokeAllFor } from "@/lib/mcp/oauth";

/** Disconnect Claude: every token for this person stops working at once. */
export async function disconnectClaude(userId?: string): Promise<{ error?: string }> {
  const viewer = await requireStaff();
  if (userId && userId !== viewer.userId && viewer.profile.role !== "owner") return { error: "Only Prashanth can disconnect someone else." };
  await revokeAllFor(userId ?? viewer.userId);
  revalidatePath("/team/settings/claude");
  return {};
}
