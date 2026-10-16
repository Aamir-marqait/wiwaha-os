import { after, NextResponse, type NextRequest } from "next/server";
import { FAL_JWKS_URL, verifyFalWebhook, type FalJwk } from "@wiwaha/integrations";
import { timingSafeEqual } from "node:crypto";
import { runRouting } from "@/lib/agents";
import { fal } from "@/lib/media/config";
import { kickMediaWorker } from "@/lib/media/kick";
import { finishJob } from "@/lib/media/worker";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

let jwks: { keys: FalJwk[]; at: number } | null = null;
async function falKeys(): Promise<FalJwk[]> {
  if (jwks && Date.now() - jwks.at < 12 * 3600_000) return jwks.keys;
  const res = await fetch(FAL_JWKS_URL, { signal: AbortSignal.timeout(5000) });
  const body = (await res.json()) as { keys?: FalJwk[] };
  jwks = { keys: body.keys ?? [], at: Date.now() };
  return jwks.keys;
}

function tokenOk(k: string | null): boolean {
  const secret = process.env.WEBHOOK_SECRET ?? "";
  if (!secret || !k) return false;
  const a = Buffer.from(k), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * fal finished a request. We accept it when fal signed it, or when it carries
 * our webhook secret; either way the result is re-read from fal's queue with
 * our key, so a forged body can't plant a picture.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signed = await falKeys().then((keys) => verifyFalWebhook({
    requestId: req.headers.get("x-fal-webhook-request-id"), userId: req.headers.get("x-fal-webhook-user-id"),
    timestamp: req.headers.get("x-fal-webhook-timestamp"), signature: req.headers.get("x-fal-webhook-signature"),
  }, raw, keys)).catch(() => false);
  if (!signed && !tokenOk(req.nextUrl.searchParams.get("k"))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  let body: { request_id?: string; gateway_request_id?: string; status?: string; error?: string | null };
  try { body = JSON.parse(raw) as typeof body; } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const requestId = body.request_id ?? body.gateway_request_id;
  if (!requestId) return NextResponse.json({ ok: true });
  const { data: job } = await createAdminClient("system").from("media_jobs").select("id, purpose, subject_table, subject_id, endpoint, request_id, status_url, response_url, status, input, attempts").eq("request_id", requestId).maybeSingle();
  if (!job || job.status !== "submitted") return NextResponse.json({ ok: true }); // unknown or already handled: acknowledge
  let output: Record<string, unknown> | null = null;
  let error: string | null = body.status === "ERROR" ? (body.error ?? "fal reported an error") : null;
  if (!error) {
    try { output = await fal().result(job.response_url as string); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  await finishJob(job as Parameters<typeof finishJob>[0], output, error);
  after(async () => {
    await runRouting();
    await kickMediaWorker();
  });
  return NextResponse.json({ ok: true });
}
