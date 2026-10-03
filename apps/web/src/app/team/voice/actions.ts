"use server";
import { finishCall, openInboundCall, voiceStart, voiceTurn, type VoiceReply } from "@wiwaha/agents";
import { normalisePhone } from "@wiwaha/db";
import { after } from "next/server";
import { agentDeps, runRouting } from "@/lib/agents";
import { requireStaff } from "@/lib/auth";

type Out = { callId?: string; reply?: VoiceReply; error?: string };

/** Starts a simulated inbound call that runs through the real Voice Concierge. */
export async function startSimCall(from: string): Promise<Out> {
  await requireStaff(["owner", "sales"]);
  const deps = agentDeps();
  const { callId } = await openInboundCall(deps, { from: normalisePhone(from) ?? null, to: "simulator" });
  const out = await voiceStart(deps, callId);
  return out.status === "done" ? { callId, reply: out.result } : { error: out.status === "error" ? out.error : "The concierge is switched off" };
}

export async function simSay(callId: string, text: string): Promise<Out> {
  await requireStaff(["owner", "sales"]);
  const out = await voiceTurn(agentDeps(), callId, text);
  return out.status === "done" ? { callId, reply: out.result } : { error: out.status === "error" ? out.error : "The concierge is switched off" };
}

export async function endSimCall(callId: string): Promise<{ summary?: string; error?: string }> {
  await requireStaff(["owner", "sales"]);
  const out = await finishCall(agentDeps(), callId, { status: "completed" });
  after(async () => { await runRouting(); });
  return out.status === "done" ? { summary: out.result.summary } : { error: "Couldn't summarise the call" };
}
