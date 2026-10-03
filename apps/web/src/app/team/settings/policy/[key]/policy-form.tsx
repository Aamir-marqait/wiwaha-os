"use client";
import { buttonClass } from "@wiwaha/ui";
import { useActionState } from "react";
import { savePolicy, type PolicyFormState } from "../actions";

export function PolicyForm({ policyKey, ruleText, value, needsConfirmation, canEdit }: { policyKey: string; ruleText: string; value: string; needsConfirmation: boolean; canEdit: boolean }) {
  const [state, action, pending] = useActionState<PolicyFormState, FormData>(savePolicy, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="key" value={policyKey} />
      <label className="block">
        <span className="text-sm font-medium">Rule (what agents read and quote)</span>
        <textarea name="rule_text" defaultValue={ruleText} rows={4} disabled={!canEdit} className="mt-1 block w-full rounded-xl border border-line bg-white p-3 text-[15px] leading-relaxed outline-none focus:border-sage-500 disabled:bg-ivory-100" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Settings (what code reads)</span>
        <span className="block text-xs text-ink-soft">Money is in paise (₹1 = 100). Checked against the rule&rsquo;s schema before saving.</span>
        <textarea name="value" defaultValue={value} rows={Math.min(24, value.split("\n").length + 1)} disabled={!canEdit} spellCheck={false} className="mt-1 block w-full rounded-xl border border-line bg-ivory-50 p-3 font-mono text-xs leading-relaxed outline-none focus:border-sage-500 disabled:bg-ivory-100" />
      </label>
      {canEdit ? (
        <>
          <input name="change_note" placeholder="Why the change? (kept in the version history)" className="block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" />
          {needsConfirmation ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmed" className="accent-sage-600" /> These details are now confirmed by Prashanth</label> : null}
          {state.error ? <p role="alert" className="rounded-lg bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">{state.error}</p> : null}
          {state.ok ? <p className="rounded-lg bg-sage-50 px-3 py-2 text-sm text-sage-800">{state.ok}</p> : null}
          <button disabled={pending} className={buttonClass("primary", "lg")}>{pending ? "Saving…" : "Save new version"}</button>
        </>
      ) : <p className="text-sm text-ink-soft">Only the owner can edit the policy book.</p>}
    </form>
  );
}
