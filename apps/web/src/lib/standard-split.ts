import "server-only";
import type { createClient } from "./supabase/server";
import { fromPolicy, type RelativePart } from "./payment-parts";

/** Prashanth's standard split from the policy book. */
export async function standardSplit(supabase: Awaited<ReturnType<typeof createClient>>): Promise<RelativePart[]> {
  const { data } = await supabase.from("policies").select("value").eq("key", "payments.schedule").maybeSingle();
  const v = (data?.value ?? { milestones: [] }) as { milestones: { milestone: string; label: string; percent_bps: number; due: string; days?: number; effect: string }[] };
  return fromPolicy(v.milestones ?? []);
}
