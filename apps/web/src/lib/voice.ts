import "server-only";
import type { VoiceReply } from "@wiwaha/agents";
import { env } from "./env";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Our voice webhooks carry ?k=<WEBHOOK_SECRET>; set the same in the Plivo application's URLs. */
export function voiceUrl(path: string, params: Record<string, string>): string {
  const q = new URLSearchParams({ ...params, k: process.env.WEBHOOK_SECRET ?? "" });
  return `${env.appUrl()}${path}?${q.toString()}`;
}

export function voiceAuthorised(url: URL): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  return !!secret && url.searchParams.get("k") === secret;
}

export function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

/** Plivo XML for one concierge reply. */
export function replyXml(callId: string, r: VoiceReply, opts: { record?: boolean } = {}): Response {
  const speak = `<Speak language="${r.speechLocale}">${esc(r.say)}</Speak>`;
  const record = opts.record ? `<Record action="${esc(voiceUrl("/api/voice/recording", { call: callId }))}" recordSession="true" redirect="false" maxLength="3600" />` : "";
  if (r.action === "transfer" && r.transferTo) {
    return xml(`${record}${speak}<Dial action="${esc(voiceUrl("/api/voice/dial", { call: callId }))}" timeout="25"><Number>${esc(r.transferTo)}</Number></Dial>`);
  }
  if (r.action === "hangup") return xml(`${record}${speak}<Hangup/>`);
  const turn = esc(voiceUrl("/api/voice/turn", { call: callId }));
  return xml(`${record}<GetInput action="${turn}" method="POST" inputType="speech" language="${r.speechLocale}" speechEndTimeout="2" executionTimeout="20" redirect="true">${speak}</GetInput><Redirect method="POST">${turn}&amp;silence=1</Redirect>`);
}

export async function formParams(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}
