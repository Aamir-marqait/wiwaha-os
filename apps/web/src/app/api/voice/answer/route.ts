import { openInboundCall, voiceStart } from "@wiwaha/agents";
import { normalisePhone } from "@wiwaha/db";
import { agentDeps } from "@/lib/agents";
import { formParams, replyXml, voiceAuthorised, xml } from "@/lib/voice";

/** Plivo answer URL: inbound calls (no ?call=) and our outbound follow-ups (?call=<id>). */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!voiceAuthorised(url)) return new Response("unauthorised", { status: 401 });
  const p = await formParams(req);
  const deps = agentDeps();
  let callId = url.searchParams.get("call");
  if (!callId) {
    const opened = await openInboundCall(deps, { from: normalisePhone(p.From) ?? p.From ?? null, to: p.To ?? null, providerRef: p.CallUUID ?? null });
    callId = opened.callId;
  }
  const out = await voiceStart(deps, callId);
  if (out.status !== "done") return xml(`<Speak language="en-IN">Thank you for calling Wiwaha by Praman. Our team will call you back shortly.</Speak><Hangup/>`);
  return replyXml(callId, out.result, { record: true });
}
