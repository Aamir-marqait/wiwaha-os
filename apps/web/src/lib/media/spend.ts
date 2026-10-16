import "server-only";
import { PolicyBook } from "@wiwaha/policy";
import { todayIST } from "@wiwaha/db";
import { agentDeps } from "../agents";
import { createAdminClient } from "../supabase/admin";
import { fal } from "./config";

/**
 * AI credits at a glance (D42): this month's estimated spend on moodboards and
 * content against the budget in the policy book, and the fal account's live
 * balance when the key is allowed to read it (a key with billing read access).
 */
export interface AiSpend {
  live: boolean;
  monthUsd: number;
  moodboardsUsd: number;
  contentUsd: number;
  jobs: number;
  budgetUsd: number;
  warnAtPct: number;
  inrPerUsd: number;
  balanceUsd: number | null;
}

let balanceCache: { at: number; usd: number | null } | null = null;

/** fal's live credit balance (GET /v1/account/billing?expand=credits), cached for ten minutes. */
async function falBalance(): Promise<number | null> {
  const key = process.env.FAL_KEY;
  if (!key) return null;
  if (balanceCache && Date.now() - balanceCache.at < 10 * 60_000) return balanceCache.usd;
  let usd: number | null = null;
  try {
    const res = await fetch("https://api.fal.ai/v1/account/billing?expand=credits", { headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { credits?: { current_balance?: unknown } };
      const b = body.credits?.current_balance;
      usd = typeof b === "number" && Number.isFinite(b) ? b : null;
    }
  } catch {
    usd = null;
  }
  balanceCache = { at: Date.now(), usd };
  return usd;
}

export async function aiSpend(): Promise<AiSpend> {
  const since = `${todayIST().slice(0, 7)}-01T00:00:00+05:30`;
  const [{ data }, rows, balance] = await Promise.all([
    createAdminClient("agent").from("media_jobs").select("cost_usd, purpose").gte("created_at", since).not("cost_usd", "is", null),
    agentDeps().store.loadPolicyRows(),
    falBalance(),
  ]);
  const rules = PolicyBook.fromRows(rows).get("media.budget");
  const jobs = data ?? [];
  const sum = (f: (p: string) => boolean) => Math.round(jobs.filter((j) => f(j.purpose as string)).reduce((s, j) => s + Number(j.cost_usd), 0) * 100) / 100;
  return {
    live: fal().live, monthUsd: sum(() => true), moodboardsUsd: sum((p) => p === "moodboard_slide"), contentUsd: sum((p) => p !== "moodboard_slide"),
    jobs: jobs.length, budgetUsd: rules.monthly_usd, warnAtPct: rules.warn_at_pct, inrPerUsd: rules.inr_per_usd, balanceUsd: balance,
  };
}
