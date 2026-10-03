"use server";
import { redirect } from "next/navigation";
import { getViewer, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return { error: "Please use at least 10 characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  const viewer = await getViewer();
  redirect(viewer && isStaff(viewer.profile.role) ? "/team" : "/portal");
}
