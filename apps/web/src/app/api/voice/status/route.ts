import { finishCall } from "@wiwaha/agents";
import { agentDeps } from "@/lib/agents";
import { formParams, voiceAuthorised } from "@/lib/voice";

/** Hangup callback: transcript, summary and outcome go onto the lead. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!voiceAuthorised(url)) return new Response("unauthorised", { status: 401 });
  const callId = url.searchParams.get("call");
  if (!callId) return new Response("ok");
  const p = await formParams(req);
  const status = ["no-answer", "busy", "cancel"].includes(p.CallStatus ?? "") ? "no_answer" : p.CallStatus === "failed" ? "failed" : "completed";
  await finishCall(agentDeps(), callId, { durationSeconds: Number(p.Duration) || null, status });
  return new Response("ok");
}
