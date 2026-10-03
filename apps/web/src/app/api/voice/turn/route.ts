import { voiceTurn } from "@wiwaha/agents";
import { agentDeps } from "@/lib/agents";
import { formParams, replyXml, voiceAuthorised, xml } from "@/lib/voice";

/** Each thing the caller says (Plivo speech recognition → Speech). */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!voiceAuthorised(url)) return new Response("unauthorised", { status: 401 });
  const callId = url.searchParams.get("call");
  if (!callId) return new Response("missing call", { status: 400 });
  const p = await formParams(req);
  const speech = (p.Speech ?? p.UnstableSpeech ?? "").trim();
  const out = await voiceTurn(agentDeps(), callId, url.searchParams.get("silence") ? "" : speech);
  if (out.status !== "done") return xml(`<Speak language="en-IN">I'm sorry, let me have the team call you back.</Speak><Hangup/>`);
  return replyXml(callId, out.result);
}
