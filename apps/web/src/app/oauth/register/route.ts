import { json, preflight } from "@/lib/mcp/http";
import { registerClient } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/** RFC 7591 dynamic client registration (Claude registers itself; public client, PKCE). */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const r = await registerClient(body);
  if (!r.client) return json({ error: "invalid_client_metadata", error_description: r.error }, 400);
  const c = r.client;
  return json({
    client_id: c.client_id, client_id_issued_at: c.client_id_issued_at, client_name: c.client_name, redirect_uris: c.redirect_uris,
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  }, 201);
}
export const OPTIONS = preflight;
