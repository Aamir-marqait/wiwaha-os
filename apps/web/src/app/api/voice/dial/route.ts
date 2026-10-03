import { transferFailed } from "@wiwaha/agents";
import { agentDeps } from "@/lib/agents";
import { formParams, replyXml, voiceAuthorised, xml } from "@/lib/voice";

/** After a transfer: if nobody answered, promise a callback and raise an urgent task. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!voiceAuthorised(url)) return new Response("unauthorised", { status: 401 });
  const callId = url.searchParams.get("call");
  if (!callId) return new Response("missing call", { status: 400 });
  const p = await formParams(req);
  if (p.DialStatus === "completed" || p.DialStatus === "answer") return xml("<Hangup/>");
  const out = await transferFailed(agentDeps(), callId);
  return out.status === "done" ? replyXml(callId, out.result) : xml("<Hangup/>");
}
