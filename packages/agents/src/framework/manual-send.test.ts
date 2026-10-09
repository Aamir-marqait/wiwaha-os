import { describe, expect, it } from "vitest";
import { createIntegrations } from "@wiwaha/integrations";
import { sendApprovedMessages } from "./kit";
import { testWorld } from "./testing";

const approved = (w: ReturnType<typeof testWorld>, id: string, channel: string, to: string) =>
  w.db.rows("messages").push({ id, channel, direction: "outbound", status: "approved", to_address: to, subject: null, body: "Hello", lead_id: null, wedding_id: "wd1", metadata: {}, created_at: "2026-10-03T00:00:00Z" });

describe("Sending approved messages without a live provider", () => {
  it("leaves WhatsApp and email for a person to send, but still delivers web chat", async () => {
    const w = testWorld();
    approved(w, "m1", "whatsapp", "+919900000101");
    approved(w, "m2", "email", "a@example.com");
    approved(w, "m3", "web_chat", "");
    const out = await sendApprovedMessages(w.deps);
    expect(out).toMatchObject({ sent: 1, awaitingManual: 2 });
    expect(w.db.rows("messages").map((m) => m.status)).toEqual(["approved", "approved", "sent"]);
    expect(w.db.rows("outbox").filter((o) => o.kind === "whatsapp")).toHaveLength(0);
  });

  it("sends through the provider once its keys are set", async () => {
    const w = testWorld();
    const sent: string[] = [];
    const fake = async (u: string) => { sent.push(u); return { ok: true, status: 200, text: async () => '{"status":"submitted","messageId":"g1"}' }; };
    w.deps.channels = createIntegrations({ NEXT_PUBLIC_APP_URL: "https://x.test", WHATSAPP_BSP: "gupshup", WHATSAPP_API_KEY: "k", WHATSAPP_SENDER_NUMBER: "919800000000", GUPSHUP_APP_NAME: "wiwaha" }, fake as never);
    approved(w, "m1", "whatsapp", "+919900000101");
    const out = await sendApprovedMessages(w.deps);
    expect(out).toMatchObject({ sent: 1, awaitingManual: 0 });
    expect(sent.length).toBe(1);
  });
});
