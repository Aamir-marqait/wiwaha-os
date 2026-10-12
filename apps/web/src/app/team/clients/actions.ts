"use server";
import { requireSection } from "@/lib/auth";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * A one-time portal sign-in link for a family member, to share on WhatsApp
 * while email isn't set up. Only for members of weddings this person can see.
 */
export async function portalLink(memberId: string): Promise<{ error?: string; link?: string }> {
  await requireSection("client", ["owner", "sales", "event_manager"]);
  const supabase = await createClient("team");
  const { data: m } = await supabase.from("wedding_members").select("id, email, display_name, user_id").eq("id", memberId).maybeSingle();
  if (!m) return { error: "That person isn't on a wedding you can see." };
  const admin = createAdminClient("system");
  const email = m.email as string;
  if (!m.user_id) {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: m.display_name } });
    if (error && !/already/i.test(error.message)) return { error: error.message };
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) return { error: error?.message ?? "Couldn't create a link." };
  return { link: `${env.appUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/portal` };
}
