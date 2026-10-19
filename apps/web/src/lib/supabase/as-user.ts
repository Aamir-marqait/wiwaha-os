import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { createAdminClient } from "./admin";

/**
 * A short Supabase session for a person (from an admin magic link, never
 * emailed), so row-level security treats a request exactly as theirs. Used by
 * the Claude connector (D38) and the team's read-only portal preview (D42).
 * Sessions are cached per server instance until shortly before they expire.
 */
const cache = new Map<string, { token: string; exp: number }>();

export async function accessTokenFor(u: { userId: string; email: string }): Promise<string> {
  const hit = cache.get(u.userId);
  if (hit && hit.exp - 120 > Date.now() / 1000) return hit.token;
  const admin = createAdminClient("system");
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.email });
  if (error || !data.properties?.hashed_token) throw new Error(`Couldn't start a session: ${error?.message ?? "no token"}`);
  const anon = createClient(env.supabaseUrl(), env.supabaseAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e2 } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (e2 || !s.session) throw new Error(`Couldn't start a session: ${e2?.message ?? "no session"}`);
  cache.set(u.userId, { token: s.session.access_token, exp: s.session.expires_at ?? Math.floor(Date.now() / 1000) + 3000 });
  return s.session.access_token;
}

/** A Supabase client acting as this person, tagged with the surface it came through. */
export async function clientAs(u: { userId: string; email: string }, opts: { surface: string; ip?: string | null }): Promise<SupabaseClient> {
  const token = await accessTokenFor(u);
  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}`, "x-wiwaha-surface": opts.surface, ...(opts.ip ? { "x-client-ip": opts.ip } : {}) } },
  });
}
