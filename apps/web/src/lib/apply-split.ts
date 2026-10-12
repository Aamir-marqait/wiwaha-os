import "server-only";
import { todayIST } from "@wiwaha/db";
import type { createClient } from "./supabase/server";
import { datesFor, parseRelativeParts, toRpcParts, totalPercent } from "./payment-parts";

/** After booking: if Prashanth changed the split on the form, give the wedding those parts. */
export async function applySplit(supabase: Awaited<ReturnType<typeof createClient>>, weddingId: string, eventStart: string, raw: string | null | undefined): Promise<string | null> {
  const parts = parseRelativeParts(raw);
  if (!parts) return null;
  if (totalPercent(parts) !== 100) return "The payment parts must add up to 100%; the standard split was used.";
  const { error } = await supabase.rpc("set_payment_parts", { p_wedding: weddingId, p_parts: toRpcParts(datesFor(parts, todayIST(), eventStart)) });
  return error ? `The wedding was created with the standard split (${error.message}).` : null;
}
