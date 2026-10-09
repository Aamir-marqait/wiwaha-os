"use server";
import { parseLeadCsv, toIngestPayload } from "@wiwaha/integrations";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runLeadDesk } from "@/lib/agents";
import { recordInbound, routeInbound } from "@/lib/inbound";
import { requireStaff } from "@/lib/auth";

export interface ImportResult { error?: string; imported?: number; duplicates?: number; problems?: { line: number; reason: string }[]; matched?: string[] }

const SOURCES = { meta_form: "meta_form", google_form: "google_form", wedmegood: "wedmegood", other: "other" } as const;

/** Leads exported from Meta Lead Center, Google Ads or a spreadsheet. Re-importing the same file never duplicates a lead. */
export async function importLeads(csv: string, source: string): Promise<ImportResult> {
  await requireStaff(["owner", "sales"]);
  const src = SOURCES[source as keyof typeof SOURCES];
  if (!src) return { error: "Choose where these leads came from." };
  if (csv.length > 2_000_000) return { error: "That file is too large. Split it into smaller files." };
  const parsed = parseLeadCsv(csv, src as never);
  if (parsed.leads.length === 0) return { error: parsed.errors[0]?.reason ?? "No leads found.", problems: parsed.errors };
  let imported = 0, duplicates = 0;
  const leadIds: string[] = [];
  for (const lead of parsed.leads) {
    const eventId = await recordInbound(`csv:${src}`, lead.externalId, toIngestPayload(lead));
    if (!eventId) { duplicates++; continue; }
    const r = await routeInbound(lead, eventId);
    if (r.leadId) leadIds.push(r.leadId);
    imported++;
  }
  // Lead Desk scores and drafts a reply for each (the drafts wait in Approvals).
  after(async () => { for (const id of [...new Set(leadIds)]) await runLeadDesk(id).catch(() => undefined); });
  revalidatePath("/team/leads");
  return { imported, duplicates, problems: parsed.errors, matched: parsed.headersMatched };
}
