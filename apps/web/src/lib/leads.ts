import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAD_SOURCES, normalisePhone, type IngestLeadResult, type LeadSource } from "@wiwaha/db";
import { z } from "zod";

/** Checkbox / JSON boolean: only true, "true", "on", "yes" or "1" count as yes. */
const boolish = z.preprocess((v) => v === true || (typeof v === "string" && ["true", "on", "yes", "1"].includes(v.toLowerCase())), z.boolean()).optional();

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/** One schema for every intake surface (website form, manual entry, later the channel webhooks). */
export const leadInputSchema = z
  .object({
    full_name: z.string().trim().min(2, "Please share your name").max(120),
    phone: optionalText(30),
    email: z.union([z.email("That email doesn't look right"), z.literal("")]).optional().transform((v) => (v ? v.toLowerCase() : undefined)),
    date_wanted: z.union([z.iso.date(), z.literal("")]).optional().transform((v) => v || undefined),
    date_flexible: boolish,
    guest_count: z.union([z.coerce.number().int().min(1).max(5000), z.literal("")]).optional().transform((v) => (v === "" ? undefined : v)),
    budget_lakhs: z.union([z.coerce.number().min(0).max(10000), z.literal("")]).optional().transform((v) => (v === "" ? undefined : v)),
    city: optionalText(80),
    event_type: z.enum(["wedding", "reception", "engagement", "pre_wedding", "corporate", "family_function", "other"]).optional(),
    message: optionalText(2000),
    source: z.enum(LEAD_SOURCES as unknown as [LeadSource, ...LeadSource[]]).optional(),
    source_detail: optionalText(200),
    consent_whatsapp: boolish,
    consent_email: boolish,
  })
  .superRefine((v, ctx) => {
    if (!v.phone && !v.email) ctx.addIssue({ code: "custom", message: "Please share a phone number or an email", path: ["phone"] });
    if (v.phone && !normalisePhone(v.phone)) ctx.addIssue({ code: "custom", message: "That phone number doesn't look right", path: ["phone"] });
  });

export type LeadInput = z.output<typeof leadInputSchema>;

export function toIngestPayload(input: LeadInput, source: LeadSource) {
  return {
    full_name: input.full_name,
    phone_e164: input.phone ? normalisePhone(input.phone) : null,
    email: input.email ?? null,
    source: input.source ?? source,
    source_detail: input.source_detail ?? null,
    event_type: input.event_type ?? "wedding",
    date_wanted: input.date_wanted ?? null,
    date_flexible: input.date_flexible ?? false,
    guest_count: input.guest_count ?? null,
    budget_paise: input.budget_lakhs !== undefined ? Math.round(input.budget_lakhs * 100_000 * 100) : null,
    city: input.city ?? null,
    message: input.message ?? null,
    consent_whatsapp: input.consent_whatsapp ?? false,
    consent_email: input.consent_email ?? false,
  };
}

/** Calls the de-duplicating intake function in the database. */
export async function ingestLead(db: SupabaseClient, payload: ReturnType<typeof toIngestPayload>): Promise<IngestLeadResult> {
  const { data, error } = await db.rpc("ingest_lead", { p: payload });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as IngestLeadResult | undefined;
  if (!row) throw new Error("Lead intake returned nothing");
  return row;
}
