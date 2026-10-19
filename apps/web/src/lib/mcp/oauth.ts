import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppRole } from "@wiwaha/db";
import { env } from "../env";
import { createAdminClient } from "../supabase/admin";

/**
 * A small OAuth 2.1 authorisation server for the Claude connector (D38):
 * dynamic client registration, authorisation code with PKCE (S256), and
 * rotating refresh tokens. Tokens are random and stored only as hashes.
 */
export const ACCESS_TTL_S = 60 * 60;            // 1 hour
export const REFRESH_TTL_S = 60 * 60 * 24 * 30; // 30 days
export const CODE_TTL_S = 5 * 60;
export const SCOPE = "wiwaha";

export const issuer = () => env.appUrl().replace(/\/$/, "");
export const resourceUrl = () => `${issuer()}/api/mcp`;
export const resourceMetadataUrl = () => `${issuer()}/.well-known/oauth-protected-resource`;

/** Who may connect Claude. Owner only while we test (MCP_ALLOWED_ROLES widens it). */
export function allowedRoles(): AppRole[] {
  const raw = process.env.MCP_ALLOWED_ROLES?.trim();
  const roles = (raw ? raw.split(",") : ["owner"]).map((r) => r.trim()).filter(Boolean);
  return roles.filter((r): r is AppRole => ["owner", "sales", "event_manager", "staff", "accounts"].includes(r));
}

/** Claude's and ChatGPT's callback hosts (and localhost for the MCP Inspector). */
function redirectAllowed(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  const hosts = (process.env.MCP_REDIRECT_HOSTS ?? "claude.ai,claude.com,chatgpt.com,openai.com,localhost,127.0.0.1").split(",").map((h) => h.trim()).filter(Boolean);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return false;
  return hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface Client { client_id: string; client_name: string | null; redirect_uris: string[] }

export async function registerClient(body: unknown): Promise<{ client?: Client & { client_id_issued_at: number }; error?: string }> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10) return { error: "redirect_uris is required" };
  if (!uris.every(redirectAllowed)) return { error: "redirect_uri not allowed for this server" };
  const client_name = typeof b.client_name === "string" ? b.client_name.slice(0, 120) : null;
  const client_id = `mcp_${token(16)}`;
  const { error } = await createAdminClient("system").from("mcp_clients").insert({ client_id, client_name, redirect_uris: uris });
  if (error) return { error: error.message };
  return { client: { client_id, client_name, redirect_uris: uris, client_id_issued_at: Math.floor(Date.now() / 1000) } };
}

export async function getClient(clientId: string): Promise<Client | null> {
  const { data } = await createAdminClient("system").from("mcp_clients").select("client_id, client_name, redirect_uris").eq("client_id", clientId).maybeSingle();
  return (data as Client | null) ?? null;
}

/** After the person approves: a one-time code bound to their PKCE challenge. */
export async function createCode(p: { clientId: string; userId: string; redirectUri: string; challenge: string; scope: string | null; resource: string | null }): Promise<string> {
  const code = token(32);
  const { error } = await createAdminClient("system").from("mcp_codes").insert({
    code_hash: sha256(code), client_id: p.clientId, user_id: p.userId, redirect_uri: p.redirectUri, code_challenge: p.challenge,
    scope: p.scope, resource: p.resource, expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

async function issue(clientId: string, userId: string, scope: string | null) {
  const access = token(32), refresh = token(32);
  const now = Date.now();
  const { error } = await createAdminClient("system").from("mcp_tokens").insert([
    { token_hash: sha256(access), kind: "access", client_id: clientId, user_id: userId, scope, expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString() },
    { token_hash: sha256(refresh), kind: "refresh", client_id: clientId, user_id: userId, scope, expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString() },
  ]);
  if (error) throw new Error(error.message);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scope ?? SCOPE };
}

type TokenResult = { ok: true; body: Awaited<ReturnType<typeof issue>> } | { ok: false; error: string; description: string };

export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; verifier: string }): Promise<TokenResult> {
  const db = createAdminClient("system");
  const { data: c } = await db.from("mcp_codes").select("*").eq("code_hash", sha256(p.code)).maybeSingle();
  if (!c || c.used_at || Date.parse(c.expires_at as string) < Date.now()) return { ok: false, error: "invalid_grant", description: "Code is invalid or expired" };
  // One use only: mark it used before anything else.
  const { data: claimed } = await db.from("mcp_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", c.code_hash).is("used_at", null).select("code_hash").maybeSingle();
  if (!claimed) return { ok: false, error: "invalid_grant", description: "Code already used" };
  if (c.client_id !== p.clientId || c.redirect_uri !== p.redirectUri) return { ok: false, error: "invalid_grant", description: "Client or redirect_uri mismatch" };
  if (!pkceOk(p.verifier, c.code_challenge as string)) return { ok: false, error: "invalid_grant", description: "PKCE verification failed" };
  if (!(await stillAllowed(c.user_id as string))) return { ok: false, error: "access_denied", description: "This account can no longer connect" };
  return { ok: true, body: await issue(p.clientId, c.user_id as string, (c.scope as string | null) ?? SCOPE) };
}

export async function refresh(p: { refreshToken: string; clientId: string }): Promise<TokenResult> {
  const db = createAdminClient("system");
  const { data: t } = await db.from("mcp_tokens").select("*").eq("token_hash", sha256(p.refreshToken)).eq("kind", "refresh").maybeSingle();
  if (!t || t.revoked_at || Date.parse(t.expires_at as string) < Date.now() || t.client_id !== p.clientId) return { ok: false, error: "invalid_grant", description: "Refresh token is invalid or expired" };
  // Rotate: the old refresh token stops working.
  const { data: revoked } = await db.from("mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", t.id).is("revoked_at", null).select("id").maybeSingle();
  if (!revoked) return { ok: false, error: "invalid_grant", description: "Refresh token already used" };
  if (!(await stillAllowed(t.user_id as string))) return { ok: false, error: "access_denied", description: "This account can no longer connect" };
  return { ok: true, body: await issue(p.clientId, t.user_id as string, t.scope as string | null) };
}

async function stillAllowed(userId: string): Promise<boolean> {
  const { data: p } = await createAdminClient("system").from("profiles").select("role, active").eq("id", userId).maybeSingle();
  return !!p && p.active === true && allowedRoles().includes(p.role as AppRole);
}

export interface McpUser { userId: string; clientId: string; email: string; name: string; role: AppRole }

/** Bearer token → the person Claude acts for (null when missing, expired, revoked or no longer allowed). */
export async function verifyAccessToken(bearer: string | null): Promise<McpUser | null> {
  if (!bearer) return null;
  const db = createAdminClient("system");
  const { data: t } = await db.from("mcp_tokens").select("id, user_id, client_id, expires_at, revoked_at, last_used_at").eq("token_hash", sha256(bearer)).eq("kind", "access").maybeSingle();
  if (!t || t.revoked_at || Date.parse(t.expires_at as string) < Date.now()) return null;
  const { data: p } = await db.from("profiles").select("email, full_name, role, active").eq("id", t.user_id).maybeSingle();
  if (!p || !p.active || !allowedRoles().includes(p.role as AppRole)) return null;
  if (!t.last_used_at || Date.now() - Date.parse(t.last_used_at as string) > 5 * 60_000) {
    await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", t.id);
  }
  return { userId: t.user_id as string, clientId: t.client_id as string, email: p.email as string, name: p.full_name as string, role: p.role as AppRole };
}

/** Revoke every Claude connection for a person (from Settings). */
export async function revokeAllFor(userId: string): Promise<void> {
  await createAdminClient("system").from("mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
}
