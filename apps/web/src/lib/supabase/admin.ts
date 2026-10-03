import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/**
 * Service-role client. Server-only: bypasses RLS. Used for the public lead
 * form, cron jobs, agents and invites. Never import from client components.
 */
export function createAdminClient(surface: "agent" | "system" | "public" = "system") {
  return createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-wiwaha-surface": surface } },
  });
}
