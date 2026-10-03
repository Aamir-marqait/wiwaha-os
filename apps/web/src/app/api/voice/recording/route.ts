import { createAdminClient } from "@/lib/supabase/admin";
import { formParams, voiceAuthorised } from "@/lib/voice";

/** Plivo posts the session recording here when the call ends. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!voiceAuthorised(url)) return new Response("unauthorised", { status: 401 });
  const callId = url.searchParams.get("call");
  const p = await formParams(req);
  if (callId && p.RecordUrl) await createAdminClient("system").from("calls").update({ recording_url: p.RecordUrl }).eq("id", callId);
  return new Response("ok");
}
