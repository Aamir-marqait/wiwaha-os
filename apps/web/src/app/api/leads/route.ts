import { after, NextResponse, type NextRequest } from "next/server";
import { runRouting } from "@/lib/agents";
import { ingestLead, leadInputSchema, toIngestPayload } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public website enquiry endpoint. Accepts JSON or form posts, so the Wiwaha
 * website can post directly. De-duplicates by phone, then Lead Desk scores
 * the lead and drafts a reply into the approval queue (after the response).
 */
const ALLOWED_ORIGINS = (process.env.LEAD_FORM_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*"))) {
    return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", Vary: "Origin" };
  }
  return {};
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  let body: Record<string, unknown>;
  const type = req.headers.get("content-type") ?? "";
  try {
    body = type.includes("application/json") ? ((await req.json()) as Record<string, unknown>) : Object.fromEntries(await req.formData());
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't read the form" }, { status: 400, headers });
  }
  // Honeypot: real people leave this hidden field empty.
  if (typeof body.website === "string" && body.website.length > 0) return NextResponse.json({ ok: true }, { headers });

  const parsed = leadInputSchema.safeParse({ ...body, source: "website" });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form", field: parsed.error.issues[0]?.path.join(".") }, { status: 422, headers });
  }

  try {
    const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const db = createAdminClient("public");
    const result = await ingestLead(db, { ...toIngestPayload(parsed.data, "website"), source_detail: fwd ? `Website form (${fwd})` : "Website form" });
    // The Chief of Staff routes the queued 'new_lead' task to Lead Desk.
    after(async () => {
      await runRouting();
    });
    return NextResponse.json({ ok: true, lead_id: result.lead_id, duplicate: !result.is_new_lead }, { status: result.is_new_lead ? 201 : 200, headers });
  } catch (err) {
    console.error("lead intake failed", err);
    return NextResponse.json({ ok: false, error: "We couldn't save your enquiry just now. Please call us or try again." }, { status: 500, headers });
  }
}
