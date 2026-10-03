"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  sent?: boolean;
}

const schema = z.object({
  email: z.email("Please enter a valid email"),
  password: z.string().optional(),
  mode: z.enum(["password", "magic"]),
  next: z.string().optional(),
  surface: z.enum(["team", "portal"]),
});

function safeNext(next: string | undefined, surface: "team" | "portal"): string {
  return next && next.startsWith(`/${surface}`) && !next.startsWith("//") ? next : `/${surface}`;
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  const { email, password, mode, next, surface } = parsed.data;
  const supabase = await createClient(surface);

  if (mode === "magic") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${env.appUrl()}/auth/callback?next=${encodeURIComponent(safeNext(next, surface))}` },
    });
    // Same message either way so we don't reveal which emails exist.
    if (error && !/not found|signups not allowed/i.test(error.message)) return { error: "We couldn't send the link just now. Please try again." };
    return { sent: true };
  }

  if (!password) return { error: "Please enter your password" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match." };
  redirect(safeNext(next, surface));
}
