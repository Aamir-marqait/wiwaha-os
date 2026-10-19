import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { shortPaymentError } from "../payment-parts";
import { pkceOk } from "./oauth";
import { registerTools } from "./tools";

const user = { userId: "11111111-1111-4111-8111-111111111111", clientId: "mcp_test", email: "admin@wiwaha.example", name: "Admin", role: "owner" as const };

async function connect(db: Partial<SupabaseClient> = {}) {
  const server = new McpServer({ name: "wiwaha-os", version: "test" });
  let writes = 0;
  registerTools(server, { db: db as SupabaseClient, user, afterWrite: () => { writes++; } });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  return { client, writes: () => writes };
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text);

describe("Wiwaha MCP server", () => {
  it("lists every tool with a JSON schema, marking reads and writes", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ["today_overview", "decide_approval", "get_costing", "set_payment_parts", "record_payment", "assign_decor", "approve_work_order", "update_policy", "create_task"]) expect(names).toContain(n);
    expect(tools.length).toBeGreaterThanOrEqual(30);
    expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true);
    expect(tools.find((t) => t.name === "get_costing")!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "record_payment")!.annotations?.readOnlyHint).toBe(false);
  });

  it("says who it acts as", async () => {
    const { client } = await connect();
    expect(text(await client.callTool({ name: "whoami", arguments: {} }))).toMatch(/admin@wiwaha\.example/);
  });

  it("refuses payment parts that don't add up to 100% before touching the database", async () => {
    const { client, writes } = await connect();
    const r = await client.callTool({ name: "set_payment_parts", arguments: { wedding_id: "c0000000-0000-4000-8000-000000000001", parts: [{ label: "Advance", percent: 50, due_on: "2027-01-01", effect: "books" }, { label: "Final", percent: 40, due_on: "2027-02-01", effect: "final" }] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/add up to 90%/);
    expect(writes()).toBe(0);
  });

  it("turns database errors into a readable message", async () => {
    const db = { rpc: async () => ({ data: null, error: { message: "Only Prashanth or an event manager can approve a work order" } }) } as unknown as SupabaseClient;
    const { client } = await connect(db);
    const r = await client.callTool({ name: "approve_work_order", arguments: { booking_id: "c0000000-0000-4000-8000-000000000001" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Only Prashanth/);
  });
});

describe("OAuth PKCE", () => {
  it("accepts the matching S256 verifier only", () => {
    const verifier = "a".repeat(43) + "-._~xyz";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(pkceOk(verifier, challenge)).toBe(true);
    expect(pkceOk(verifier + "x", challenge)).toBe(false);
    expect(pkceOk("short", challenge)).toBe(false);
  });
});

describe("Recording a payment", () => {
  it("refuses less than the part, since paying a part fires its unlocks", () => {
    expect(shortPaymentError(60_000_000, 180_000_000)).toMatch(/less than this part/);
    expect(shortPaymentError(180_000_000, 180_000_000)).toBeNull();
    expect(shortPaymentError(180_000_100, 180_000_000)).toBeNull();
  });
});
