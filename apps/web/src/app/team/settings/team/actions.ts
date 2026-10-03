"use server";
import type { AppRole } from "@wiwaha/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { friendlyError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
  full_name: z.string().trim().min(2, "Enter their name"),
  role: z.enum(["owner", "sales", "event_manager", "staff", "accounts"]),
  title: z.string().trim().max(80).optional(),
});

/**
 * Staff invite: the owner records the invite (RLS: owner only), then Supabase
 * emails a link. When they accept, handle_new_user() gives them this role.
 */
export async function inviteStaff(_prev: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  const viewer = await requireStaff(["owner"]);
  const parsed = inviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { email, full_name, role, title } = parsed.data;

  const supabase = await createClient("team");
  const { error: invErr } = await supabase.from("staff_invites").insert({ email, full_name, role, title: title || null, invited_by: viewer.userId });
  if (invErr) return { error: invErr.code === "23505" ? "There's already an open invite for that email." : friendlyError(invErr) };

  const admin = createAdminClient("system");
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.appUrl()}/auth/callback?next=/auth/set-password`,
    data: { full_name },
  });
  revalidatePath("/team/settings/team");
  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      // Existing account (e.g. a former client): promote directly. The owner is doing this, and it's audited.
      const { data: u } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
      if (u) {
        await supabase.from("profiles").update({ role: role as AppRole, active: true, title: title || null }).eq("id", u.id);
        await supabase.from("staff_invites").update({ accepted_at: new Date().toISOString() }).eq("email", email).is("accepted_at", null);
        return { ok: `${full_name} already had an account; their role is now ${role.replace("_", " ")}.` };
      }
    }
    return { error: `Invite saved, but the email failed: ${error.message}` };
  }
  return { ok: `Invite sent to ${email}.` };
}

export async function setActive(userId: string, active: boolean): Promise<{ error?: string }> {
  const viewer = await requireStaff(["owner"]);
  if (userId === viewer.userId) return { error: "You can't deactivate yourself." };
  const supabase = await createClient("team");
  const { error } = await supabase.from("profiles").update({ active }).eq("id", userId);
  revalidatePath("/team/settings/team");
  return error ? { error: friendlyError(error) } : {};
}

export async function revokeInvite(id: string): Promise<{ error?: string }> {
  await requireStaff(["owner"]);
  const supabase = await createClient("team");
  const { error } = await supabase.from("staff_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/team/settings/team");
  return error ? { error: friendlyError(error) } : {};
}
