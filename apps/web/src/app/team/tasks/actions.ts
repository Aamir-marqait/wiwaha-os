"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface NewTask { title: string; description: string; ownerId: string; ownerRole: string; date: string; time: string; priority: string; proof: string; weddingId: string }

const ROLES = ["owner", "sales", "event_manager", "staff", "accounts"];

/** A task added by hand, for a person or a whole role, optionally tied to a wedding. */
export async function createTask(t: NewTask): Promise<{ error?: string }> {
  const viewer = await requireStaff(["owner", "event_manager", "sales"]);
  if (t.title.trim().length < 3) return { error: "Describe the task." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return { error: "Choose a due date." };
  if (!["low", "normal", "high", "urgent"].includes(t.priority)) return { error: "Choose a priority." };
  if (!["none", "tick", "photo", "file"].includes(t.proof)) return { error: "Choose the proof needed." };
  if (!t.ownerId && !ROLES.includes(t.ownerRole)) return { error: "Choose who does it." };
  const supabase = await createClient("team");
  let role = t.ownerRole;
  if (t.ownerId) {
    const { data: p } = await supabase.from("profiles").select("role").eq("id", t.ownerId).maybeSingle();
    if (!p) return { error: "That person isn't on the team." };
    role = p.role as string;
  }
  const { error } = await supabase.from("tasks").insert({
    scope: t.weddingId ? "wedding" : role === "staff" ? "estate" : role === "sales" ? "sales" : "admin",
    wedding_id: t.weddingId || null, title: t.title.trim().slice(0, 300), description: t.description.trim().slice(0, 2000) || null,
    owner_id: t.ownerId || null, owner_role: role, due_at: new Date(`${t.date}T${t.time || "18:00"}:00+05:30`).toISOString(),
    priority: t.priority, proof_kind: t.proof, created_by: viewer.userId,
  });
  revalidatePath("/team/tasks");
  if (t.weddingId) revalidatePath(`/team/weddings/${t.weddingId}`);
  return error ? { error: friendlyError(error) } : {};
}
