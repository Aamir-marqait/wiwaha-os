import { addDays, todayIST } from "@wiwaha/db";
import type { NextRequest } from "next/server";
import { feedSigOk } from "@/lib/calendar-feed";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.replace(/-/g, "");
/** Lines over 75 octets are folded (RFC 5545). */
const fold = (line: string) => line.length <= 74 ? line : line.match(/.{1,73}/g)!.join("\r\n ");

/**
 * Read-only booking feed for Google Calendar or iCloud: confirmed bookings and
 * live holds, per space ("scope" = a space id) or for every space ("all").
 */
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") ?? "";
  if (!feedSigOk(scope, req.nextUrl.searchParams.get("sig"))) return new Response("Not found", { status: 404 });
  const db = createAdminClient("system");
  const today = todayIST();
  let q = db.from("calendar_entries")
    .select("id, label, starts_on, ends_on, status, updated_at, space:spaces(name), wedding:weddings(code)")
    .eq("resource_kind", "space").in("status", ["confirmed", "held"])
    .gte("ends_on", addDays(today, -60)).lte("starts_on", addDays(today, 730));
  let name = "Wiwaha: all spaces";
  if (scope !== "all") {
    const { data: sp } = await db.from("spaces").select("id, name").eq("id", scope).maybeSingle();
    if (!sp) return new Response("Not found", { status: 404 });
    name = `Wiwaha: ${sp.name as string}`;
    q = q.eq("space_id", scope);
  }
  const { data } = await q;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wiwaha by Praman//Wiwaha OS//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Asia/Kolkata", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const e of data ?? []) {
    const sp = (Array.isArray(e.space) ? e.space[0] : e.space) as { name: string } | null;
    const w = (Array.isArray(e.wedding) ? e.wedding[0] : e.wedding) as { code: string } | null;
    const held = e.status === "held";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id as string}@wiwaha-os`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.starts_on as string)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(e.ends_on as string, 1))}`,
      fold(`SUMMARY:${esc(`${held ? "HELD · " : ""}${(e.label as string | null) ?? "Booking"}${scope === "all" && sp ? ` · ${sp.name}` : ""}`)}`),
      ...(sp ? [fold(`LOCATION:${esc(`${sp.name}, Wiwaha by Praman`)}`)] : []),
      ...(w ? [`DESCRIPTION:${esc(`Wedding ${w.code}`)}`] : []),
      `STATUS:${held ? "TENTATIVE" : "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300", "content-disposition": `inline; filename="wiwaha.ics"` },
  });
}
