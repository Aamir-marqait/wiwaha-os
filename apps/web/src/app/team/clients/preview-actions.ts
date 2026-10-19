"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { PREVIEW_COOKIE, previewMember, staffMayPreview } from "@/lib/portal-preview";

/** Open this wedding's portal as the couple sees it (read-only). */
export async function startPortalPreview(weddingId: string): Promise<{ error?: string }> {
  const staff = await requireStaff(["owner", "sales", "event_manager"]);
  if (!(await staffMayPreview(staff, weddingId))) return { error: "You can't see this wedding's portal." };
  if (!(await previewMember(weddingId))) return { error: "No one in the family has a portal login yet. Send them their sign-in link from Client portal first." };
  (await cookies()).set(PREVIEW_COOKIE, weddingId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 });
  redirect("/portal");
}

export async function endPortalPreview(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(PREVIEW_COOKIE)?.value;
  jar.delete(PREVIEW_COOKIE);
  redirect(id ? `/team/weddings/${id}` : "/team");
}
