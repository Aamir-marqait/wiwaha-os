import "server-only";

/** CORS for the browser-based MCP Inspector; Claude calls server-to-server. */
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra } });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Form or JSON body → plain record. */
export async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const v: unknown = await req.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).map(([k, x]) => [k, typeof x === "string" ? x : JSON.stringify(x)]));
  }
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}
