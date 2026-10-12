import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { sendApprovedMessages } from "@wiwaha/agents";
import { after } from "next/server";
import { agentDeps, runRouting } from "@/lib/agents";
import { CORS, preflight } from "@/lib/mcp/http";
import { resourceMetadataUrl, SCOPE, verifyAccessToken } from "@/lib/mcp/oauth";
import { clientFor } from "@/lib/mcp/session";
import { registerTools } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INSTRUCTIONS = `Wiwaha OS runs Wiwaha by Praman, a wedding estate near Bengaluru. You are acting as the signed-in team member, with exactly their permissions; every change is logged. Money is shown in rupees. Dates are India time. Business rules live in the policy book (get_policies): never promise prices, discounts or anything the policy book doesn't say. Prefer today_overview to start. Before a change that affects a couple or a vendor (approvals, payments, work orders), say what you're about to do.`;

function unauthorised(): Response {
  return new Response(JSON.stringify({ error: "invalid_token", error_description: "Sign in to Wiwaha OS to use this connector" }), {
    status: 401,
    headers: { "content-type": "application/json", ...CORS, "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl()}", scope="${SCOPE}"` },
  });
}

/** The MCP endpoint (Streamable HTTP, stateless, JSON responses). */
async function handle(req: Request): Promise<Response> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const user = await verifyAccessToken(bearer);
  if (!user) return unauthorised();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const db = await clientFor(user, ip);
  const server = new McpServer({ name: "wiwaha-os", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  let wrote = false;
  registerTools(server, { db, user, afterWrite: () => { wrote = true; } });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req, { authInfo: { token: bearer!, clientId: user.clientId, scopes: [SCOPE], extra: { userId: user.userId } } });
  // Like the app: queued agent work is routed, and approved messages go out, after the response.
  after(async () => {
    if (wrote) {
      await runRouting().catch(() => undefined);
      await sendApprovedMessages(agentDeps()).catch(() => undefined);
    }
    await server.close().catch(() => undefined);
  });
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
