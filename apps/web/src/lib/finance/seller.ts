import "server-only";
import { PolicyBook } from "@wiwaha/policy";
import { agentDeps } from "../agents";
import { fetchMedia } from "../media/storage";
import { createAdminClient } from "../supabase/admin";
import type { Seller } from "./documents";

const STATES: Record<string, string> = { "29": "Karnataka" };

/** Who the receipt or invoice is from: the brand's name and logo, and the legal details in the policy book. */
export async function loadSeller(): Promise<Seller> {
  const [{ data: brand }, rows] = await Promise.all([
    createAdminClient("agent").from("studio_brand").select("profile, logo_url").eq("id", 1).maybeSingle(),
    agentDeps().store.loadPolicyRows(),
  ]);
  const gst = PolicyBook.fromRows(rows).get("finance.gst");
  const name = ((brand?.profile ?? {}) as { brand_name?: string }).brand_name?.replace(/^WIWAHA\b/, "Wiwaha") || "Wiwaha by Praman";
  let logo: Buffer | null = null;
  if (brand?.logo_url) logo = await fetchMedia(brand.logo_url as string).catch(() => null);
  return {
    name, legalName: gst.legal_name?.trim() || null, address: gst.address?.trim() || null, gstin: gst.gstin,
    stateCode: gst.state_code ? `${STATES[gst.state_code] ?? "State"} (${gst.state_code})` : null, logo,
  };
}
