import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env } from "../env";

/** First hop of x-forwarded-for: the browser's IP as Vercel sees it. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0]?.trim() : null) || h.get("x-real-ip") || null;
}

/**
 * Supabase client acting as the signed-in user (RLS applies). Forwards the
 * browser IP and user agent so the audit trigger can record them.
 */
export async function createClient(surface: "team" | "portal" | "public" = "team") {
  const cookieStore = await cookies();
  const h = await headers();
  const ip = await clientIp();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    global: {
      headers: {
        ...(ip ? { "x-client-ip": ip } : {}),
        "x-wiwaha-surface": surface,
        ...(h.get("user-agent") ? { "user-agent": h.get("user-agent")! } : {}),
      },
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}
