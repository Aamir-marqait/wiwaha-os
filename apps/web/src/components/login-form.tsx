"use client";
import { buttonClass } from "@wiwaha/ui";
import { useActionState, useState } from "react";
import { signIn, type AuthState } from "@/app/login/actions";

export function LoginForm({ surface, next }: { surface: "team" | "portal"; next?: string }) {
  const [mode, setMode] = useState<"password" | "magic">(surface === "portal" ? "magic" : "password");
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  if (state.sent) {
    return (
      <div className="rounded-2xl bg-sage-50 p-5 text-center ring-1 ring-sage-200">
        <p className="font-serif text-2xl text-sage-800">Check your email</p>
        <p className="mt-2 text-sm text-ink-soft">If that address has an account, a sign-in link is on its way. It works once and expires in an hour.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="mode" value={mode} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="block">
        <span className="text-sm font-medium text-ink">Email</span>
        <input name="email" type="email" autoComplete="email" required className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-200" />
      </label>
      {mode === "password" ? (
        <label className="block">
          <span className="text-sm font-medium text-ink">Password</span>
          <input name="password" type="password" autoComplete="current-password" required className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-200" />
        </label>
      ) : null}
      {state.error ? <p role="alert" className="rounded-lg bg-burgundy-50 px-3 py-2 text-sm text-burgundy-700">{state.error}</p> : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
        {pending ? "One moment…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </button>
      <button type="button" onClick={() => setMode(mode === "password" ? "magic" : "password")} className="block w-full text-center text-sm text-sage-700 underline-offset-2 hover:underline">
        {mode === "password" ? "Email me a link instead" : "Use a password instead"}
      </button>
    </form>
  );
}
