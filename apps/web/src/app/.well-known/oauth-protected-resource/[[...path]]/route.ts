import { issuer, resourceUrl, SCOPE } from "@/lib/mcp/oauth";
import { json, preflight } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";

/** RFC 9728: where Claude learns which server issues tokens for /api/mcp. */
export function GET() {
  return json({ resource: resourceUrl(), authorization_servers: [issuer()], bearer_methods_supported: ["header"], scopes_supported: [SCOPE], resource_name: "Wiwaha OS" });
}
export const OPTIONS = preflight;
