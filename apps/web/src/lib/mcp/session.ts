import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { createAdminClient } from "../supabase/admin";
import type { McpUser } from "./oauth";

/**
 * Claude acts as the person who connected it: a short Supabase session for
 * them (from an admin magic link, never emailed), so row-level security and
 * the audit log treat every tool call exactly like their own edit in the app.
 * Sessions are cached per server instance until shortly before they expire.
 */
const cache = new Map<string, { token: string; exp: number }>();

async function accessTokenFor(u: McpUser): Promise<string> {
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

/** A Supabase client acting as this person, tagged so audit rows show it came through Claude. */
export async function clientFor(u: McpUser, ip: string | null): Promise<SupabaseClient> {
  const token = await accessTokenFor(u);
  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}`, "x-wiwaha-surface": "mcp", ...(ip ? { "x-client-ip": ip } : {}) } },
  });
}
