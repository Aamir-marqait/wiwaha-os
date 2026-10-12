import { json, preflight, readBody } from "@/lib/mcp/http";
import { exchangeCode, refresh } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/** Token endpoint: authorisation code (with PKCE) or refresh token. */
export async function POST(req: Request) {
  const b = await readBody(req);
  const clientId = b.client_id ?? "";
  if (!clientId) return json({ error: "invalid_client", error_description: "client_id is required" }, 401);
  const r = b.grant_type === "authorization_code"
    ? await exchangeCode({ code: b.code ?? "", clientId, redirectUri: b.redirect_uri ?? "", verifier: b.code_verifier ?? "" })
    : b.grant_type === "refresh_token"
      ? await refresh({ refreshToken: b.refresh_token ?? "", clientId })
      : { ok: false as const, error: "unsupported_grant_type", description: "Use authorization_code or refresh_token" };
  return r.ok ? json(r.body) : json({ error: r.error, error_description: r.description }, 400);
}
export const OPTIONS = preflight;
