"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const SOURCES: Record<string, string> = { meta: "instagram", google: "google_ads" };

/**
 * Ad spend until the Meta / Google APIs are connected: paste CSV lines
 * "platform,date,campaign,spend_in_rupees[,clicks,impressions]".
 */
export async function importSpend(csv: string): Promise<{ error?: string; ok?: string }> {
  await requireStaff(["owner", "sales", "accounts"]);
  const rows = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^platform/i.test(l)).map((l) => l.split(",").map((x) => x.trim()));
  const bad = rows.find((r) => !["meta", "google"].includes((r[0] ?? "").toLowerCase()) || !/^\d{4}-\d{2}-\d{2}$/.test(r[1] ?? "") || !Number.isFinite(Number(r[3])));
  if (!rows.length) return { error: "Paste at least one line." };
  if (bad) return { error: `Couldn't read: "${bad.join(",")}". Use platform,date,campaign,spend.` };
  const supabase = await createClient();
  const { error } = await supabase.from("ad_spend").upsert(rows.map((r) => ({
    platform: r[0]!.toLowerCase(), day: r[1], campaign: r[2] || "all", lead_source: SOURCES[r[0]!.toLowerCase()],
    spend_paise: Math.round(Number(r[3]) * 100), clicks: r[4] ? Number(r[4]) : null, impressions: r[5] ? Number(r[5]) : null, imported_from: "csv",
  })), { onConflict: "platform,day,campaign" });
  revalidatePath("/team/marketing");
  return error ? { error: friendlyError(error) } : { ok: `${rows.length} line${rows.length > 1 ? "s" : ""} imported.` };
}
