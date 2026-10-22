"use server";
import { randomInt } from "node:crypto";
import { normalisePhone } from "@wiwaha/db";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { phoneLoginEmail } from "@/lib/phone-login";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Role = "couple" | "parent" | "family" | "planner";
const STAFF = ["owner", "sales", "event_manager"] as const;
const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** What each kind of family member may do in the portal (the couple decides more later). */
function rights(role: Role) {
  const couple = role === "couple";
  return { can_start_stages: couple, can_edit_brief: couple || role === "parent", can_approve: couple, can_view_payments: couple, can_manage_members: couple };
}

export interface LoginResult { error?: string; pin?: string; phone?: string; name?: string; url?: string }

/** A portal login for one family member: their phone number and a new 6-digit PIN, shown once to share. */
export async function createFamilyLogin(weddingId: string, input: { name: string; phone: string; role: string; contactId?: string | null }): Promise<LoginResult> {
  await requireStaff(STAFF);
  const team = await createClient("team");
  const { data: w } = await team.from("weddings").select("id").eq("id", weddingId).maybeSingle();
  if (!w) return { error: "You can't change this wedding's portal." };
  const name = input.name.trim();
  const e164 = normalisePhone(input.phone);
  const email = e164 ? phoneLoginEmail(e164) : null;
  const role: Role = (["couple", "parent", "family", "planner"] as const).find((r) => r === input.role) ?? "family";
  if (name.length < 2) return { error: "Add their name." };
  if (!e164 || !email) return { error: "That phone number doesn't look right." };
  const admin = createAdminClient("system");
  const pin = newPin();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  const { error: mErr } = await admin.from("wedding_members").upsert(
    { wedding_id: weddingId, email, display_name: name.split(" ")[0], member_role: role, login_phone: e164, user_id: existing?.id ?? null, ...(input.contactId ? { contact_id: input.contactId } : {}), ...rights(role) },
    { onConflict: "wedding_id,email" },
  );
  if (mErr) return { error: mErr.message };
  const res = existing
    ? await admin.auth.admin.updateUserById(existing.id as string, { password: pin })
    : await admin.auth.admin.createUser({ email, password: pin, email_confirm: true, user_metadata: { full_name: name, phone: e164 } });
  if (res.error) return { error: res.error.message };
  // No revalidate here: the PIN stays on screen until "Done" refreshes the list.
  return { pin, phone: e164, name, url: `${env.appUrl()}/portal/login` };
}

/** A new PIN for a phone login (the old one stops working). */
export async function resetFamilyPin(memberId: string): Promise<LoginResult> {
  await requireStaff(STAFF);
  const team = await createClient("team");
  const { data: m } = await team.from("wedding_members").select("id, wedding_id, user_id, login_phone, display_name").eq("id", memberId).maybeSingle();
  if (!m?.user_id || !m.login_phone) return { error: "This person signs in by email, not with a PIN." };
  const pin = newPin();
  const { error } = await createAdminClient("system").auth.admin.updateUserById(m.user_id as string, { password: pin });
  if (error) return { error: error.message };
  return { pin, phone: m.login_phone as string, name: m.display_name as string, url: `${env.appUrl()}/portal/login` };
}
