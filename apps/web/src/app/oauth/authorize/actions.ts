"use server";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { allowedRoles, createCode, getClient } from "@/lib/mcp/oauth";

/** The person allows (or refuses) Claude acting as them. */
export async function decideConnection(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const client = await getClient(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) redirect("/team?denied=1");
  const back = new URL(redirectUri);
  if (state) back.searchParams.set("state", state);
  if (form.get("decision") !== "allow" || !viewer || !viewer.profile.active || !allowedRoles().includes(viewer.profile.role)) {
    back.searchParams.set("error", "access_denied");
    redirect(back.toString());
  }
  const code = await createCode({
    clientId, userId: viewer.userId, redirectUri, challenge: String(form.get("code_challenge") ?? ""),
    scope: String(form.get("scope") ?? "") || null, resource: String(form.get("resource") ?? "") || null,
  });
  back.searchParams.set("code", code);
  redirect(back.toString());
}
