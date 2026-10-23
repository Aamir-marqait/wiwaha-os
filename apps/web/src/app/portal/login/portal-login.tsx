"use client";
import { buttonClass } from "@wiwaha/ui";
import { useActionState, useState } from "react";
import { signInWithPhone, type AuthState } from "@/app/login/actions";
import { LoginForm } from "@/components/login-form";

const input = "mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-200";

/** Phone and PIN first (most families); email for those invited by email. */
export function PortalLogin({ next }: { next?: string }) {
  const [useEmail, setUseEmail] = useState(false);
  const [state, action, pending] = useActionState<AuthState, FormData>(signInWithPhone, {});
  if (useEmail) {
    return (
      <div className="space-y-4">
        <LoginForm surface="portal" next={next} />
        <button type="button" onClick={() => setUseEmail(false)} className="block w-full text-center text-sm text-sage-700 hover:underline">Sign in with your phone number instead</button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="block"><span className="text-sm font-medium text-ink">Mobile number</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="98450 12345" className={input} /></label>
      <label className="block"><span className="text-sm font-medium text-ink">PIN</span><input name="pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="\d{6}" maxLength={6} required placeholder="6 digits" className={`${input} tracking-[0.3em]`} /></label>
      {state.error ? <p role="alert" className="rounded-lg bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">{state.error}</p> : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>{pending ? "One moment…" : "Sign in"}</button>
      <button type="button" onClick={() => setUseEmail(true)} className="block w-full text-center text-sm text-sage-700 hover:underline">Invited by email? Sign in with email</button>
    </form>
  );
}
