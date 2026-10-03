import { after, NextResponse, type NextRequest } from "next/server";
import { runRouting } from "@/lib/agents";
import { hasWebhookKey } from "@/lib/inbound";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * New Google / WedMeGood reviews (from a listings tool or automation):
 * {platform, external_id, author_name, rating, body, posted_at}.
 */
export async function POST(req: NextRequest) {
  if (!hasWebhookKey(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { platform?: string; external_id?: string; author_name?: string; rating?: number; body?: string; posted_at?: string } | null;
  if (!b?.platform || !["google", "wedmegood"].includes(b.platform) || !b.external_id) return NextResponse.json({ error: "platform and external_id are required" }, { status: 400 });
  const db = createAdminClient("system");
  const { data, error } = await db.from("external_reviews").upsert({ platform: b.platform, external_id: b.external_id, author_name: b.author_name ?? null, rating: b.rating ?? null, body: b.body ?? null, posted_at: b.posted_at ?? null }, { onConflict: "platform,external_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.id) {
    await db.from("agent_tasks").insert({ kind: "external_review", payload: { review_id: data.id } });
    after(async () => { await runRouting(); });
  }
  return NextResponse.json({ ok: true, review_id: data?.id ?? null, duplicate: !data });
}
