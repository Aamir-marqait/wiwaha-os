import "server-only";
import type { AppRole, Profile } from "@wiwaha/db";
import { STAFF_ROLES } from "@wiwaha/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export interface Viewer {
  userId: string;
  email: string | null;
  profile: Profile;
}

/** The signed-in user and their profile, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile) return null;
  return { userId: data.user.id, email: data.user.email ?? null, profile: profile as Profile };
});

export function isStaff(role: AppRole): boolean {
  return STAFF_ROLES.includes(role);
}

/** For /team pages: signed-in, active staff (optionally a specific role). */
export async function requireStaff(roles?: readonly AppRole[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profile.active || !isStaff(viewer.profile.role)) redirect("/portal");
  if (roles && !roles.includes(viewer.profile.role)) redirect("/team?denied=1");
  return viewer;
}

export async function requireClient(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/portal/login");
  if (isStaff(viewer.profile.role)) redirect("/team");
  return viewer;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  sales: "Sales",
  event_manager: "Event manager",
  staff: "Estate staff",
  accounts: "Accounts",
  client: "Client",
  vendor: "Vendor",
  agent: "Agent",
};
