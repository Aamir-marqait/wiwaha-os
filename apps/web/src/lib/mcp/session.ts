import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientAs } from "../supabase/as-user";
import type { McpUser } from "./oauth";

/**
 * Claude acts as the person who connected it (D38): row-level security and
 * the audit log treat every tool call exactly like their own edit in the app.
 */
export async function clientFor(u: McpUser, ip: string | null): Promise<SupabaseClient> {
  return clientAs(u, { surface: "mcp", ip });
}
