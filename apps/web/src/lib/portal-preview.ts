import "server-only";
import type { Profile } from "@wiwaha/db";
import { cookies } from "next/headers";
import { getViewer, isStaff, type Viewer, viewerSections } from "./auth";
import { createAdminClient } from "./supabase/admin";
import { clientAs } from "./supabase/as-user";
import { createClient } from "./supabase/server";

/**
 * "See as the couple" (D42): staff open a wedding's portal exactly as the
 * couple sees it. Pages read through a session for the couple's own login, so
 * row-level security shows what they see, nothing more (unshared moodboards stay
 * hidden). It is read-only: portal actions still check the real signed-in
 * person, who is staff, and refuse. The cookie only names the wedding; each
 * render checks again that this staff member may see it.
 */
export const PREVIEW_COOKIE = "wiwaha_preview";
const ROLES = ["owner", "sales", "event_manager"] as const;

export interface PortalPreview { weddingId: string; staff: Viewer; viewer: Viewer; client: Awaited<ReturnType<typeof clientAs>> }

/** Which family login the preview uses: a member of the couple who has signed up, else anyone in the family. */
export async function previewMember(weddingId: string): Promise<{ userId: string; email: string } | null> {
  const { data } = await createAdminClient("system").from("wedding_members").select("user_id, email, member_role").eq("wedding_id", weddingId).not("user_id", "is", null);
  const list = (data ?? []) as { user_id: string; email: string; member_role: string }[];
  const m = list.find((x) => x.member_role === "couple") ?? list[0];
  return m ? { userId: m.user_id, email: m.email } : null;
}

export async function staffMayPreview(staff: Viewer, weddingId: string): Promise<boolean> {
  if (!isStaff(staff.profile.role) || !staff.profile.active) return false;
  if (!(ROLES as readonly string[]).includes(staff.profile.role) || !viewerSections(staff).includes("client")) return false;
  const supabase = await createClient("team");
  const { data } = await supabase.from("weddings").select("id").eq("id", weddingId).maybeSingle();
  return !!data;
}

export async function portalPreview(): Promise<PortalPreview | null> {
  const weddingId = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (!weddingId || !/^[0-9a-f-]{36}$/i.test(weddingId)) return null;
  const staff = await getViewer();
  if (!staff || !(await staffMayPreview(staff, weddingId))) return null;
  const member = await previewMember(weddingId);
  if (!member) return null;
  const { data: profile } = await createAdminClient("system").from("profiles").select("*").eq("id", member.userId).maybeSingle();
  if (!profile) return null;
  const client = await clientAs(member, { surface: "preview" });
  return { weddingId, staff, viewer: { userId: member.userId, email: member.email, profile: profile as Profile }, client };
}
