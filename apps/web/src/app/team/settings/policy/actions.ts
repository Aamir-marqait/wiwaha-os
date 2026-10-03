"use server";
import { isPolicyKey, policySchemas } from "@wiwaha/policy";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface PolicyFormState {
  error?: string;
  ok?: string;
}

/** Owner edits a rule. Structured values are validated against the typed schema before saving. */
export async function savePolicy(_prev: PolicyFormState, form: FormData): Promise<PolicyFormState> {
  await requireStaff(["owner"]);
  const key = String(form.get("key") ?? "");
  const ruleText = String(form.get("rule_text") ?? "").trim();
  const rawValue = String(form.get("value") ?? "");
  const note = String(form.get("change_note") ?? "").trim();
  if (ruleText.length < 5) return { error: "The rule text is too short." };

  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    return { error: "The settings aren't valid JSON. Check for a missing comma or quote." };
  }
  if (isPolicyKey(key)) {
    const parsed = policySchemas[key].safeParse(value);
    if (!parsed.success) return { error: `Settings don't fit this rule: ${parsed.error.issues.map((i) => `${i.path.join(".") || "value"} ${i.message}`).join("; ")}` };
    value = parsed.data;
  }

  const supabase = await createClient("team");
  const { error, data } = await supabase.rpc("update_policy", { p_key: key, p_rule_text: ruleText, p_value: value, p_note: note || null, p_confirmed: form.get("confirmed") === "on" });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/team/settings/policy");
  revalidatePath(`/team/settings/policy/${key}`);
  return { ok: `Saved as version ${(data as { version: number }).version}. Agents use it from their next run.` };
}
