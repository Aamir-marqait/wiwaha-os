"use client";
import { buttonClass } from "@wiwaha/ui";
import { useActionState } from "react";
import { setPassword } from "./actions";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, {} as { error?: string });
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">New password</span>
        <input name="password" type="password" minLength={10} required autoComplete="new-password" className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-sage-500" />
        <span className="mt-1 block text-xs text-ink-soft">At least 10 characters.</span>
      </label>
      {state.error ? <p role="alert" className="rounded-lg bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">{state.error}</p> : null}
      <button disabled={pending} className={buttonClass("primary", "lg", "w-full")}>{pending ? "Saving…" : "Save and continue"}</button>
    </form>
  );
}
