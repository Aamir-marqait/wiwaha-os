import { describe, expect, it } from "vitest";
import { createIntegrations } from "@wiwaha/integrations";
import { decide, seedWedding, STAFF, testWorld } from "../../framework/testing";
import { draftContract, onContractDecided, onPaymentReceived, sendPaymentReminders } from "./agent";

describe("Contract & Payments", () => {
  it("drafts the contract from the policy book and waits for Prashanth", async () => {
    const w = testWorld();
    seedWedding(w);
    const out = await draftContract(w.deps, "wd1");
    expect(out.status).toBe("done");
    const contract = w.db.rows("contracts")[0]!;
    expect(contract).toMatchObject({ status: "pending_approval", version: 1 });
    expect(String(contract.body_md)).toMatch(/Venue Agreement — WIW-2027-001/);
    expect(String(contract.body_md)).toMatch(/Deposit \(10%\)/);
    expect(w.store.approvals[0]).toMatchObject({ kind: "contract", priority: 1 });
    // Nothing reaches the couple, and nothing is sent for signature, before approval.
    expect(w.db.rows("outbox")).toHaveLength(0);
  });

  it("once approved, sends it for e-signature with the deposit link", async () => {
    const w = testWorld();
    seedWedding(w);
    const d = await draftContract(w.deps, "wd1");
    if (d.status !== "done") throw new Error("draft failed");
    decide(w, d.result.approvalId);
    const out = await onContractDecided(w.deps, d.result.approvalId, "approved");
    expect(out.status === "done" && out.result.sent).toBe(true);
    expect(w.db.rows("contracts")[0]).toMatchObject({ status: "sent", esign_provider: "sandbox" });
    expect(String(w.db.rows("contracts")[0]!.esign_url)).toMatch(/\/sign\/sandbox\//);
    expect(w.db.rows("payments").find((p) => p.id === "pay-dep")).toMatchObject({ status: "link_sent", link_url: "https://wiwaha.test/pay/sandbox/pay-dep" });
    const toCouple = w.db.rows("outbox").find((o) => o.kind === "whatsapp" && o.to_address === "+919900000101");
    expect(toCouple).toBeTruthy();
    expect(w.store.messages.at(-1)!.body).toMatch(/Sign your contract: https:\/\/wiwaha\.test\/sign\/sandbox\//);
  });

  it("a rejected contract goes back to draft and sends nothing", async () => {
    const w = testWorld();
    seedWedding(w);
    const d = await draftContract(w.deps, "wd1");
    if (d.status !== "done") throw new Error("draft failed");
    decide(w, d.result.approvalId, "rejected");
    await onContractDecided(w.deps, d.result.approvalId, "rejected");
    expect(w.db.rows("contracts")[0]).toMatchObject({ status: "draft" });
    expect(w.db.rows("outbox")).toHaveLength(0);
  });

  it("deposit received: receipt drafted, onboarding queued, accounts told", async () => {
    const w = testWorld();
    seedWedding(w, { paid: ["deposit"] });
    const out = await onPaymentReceived(w.deps, "pay-dep");
    expect(out.status === "done" && out.result.receipt).toBe("RCPT-1");
    expect(w.db.rows("agent_tasks").find((t) => t.kind === "deposit_paid")).toBeTruthy();
    expect(w.db.rows("weddings")[0]).toMatchObject({ stage: "onboarding" });
    const receipt = w.store.messages.find((m) => /RCPT-1/.test(m.body))!;
    expect(receipt.status).toBe("pending_approval");
    expect(receipt.body).toMatch(/date is now held/);
    expect(receipt.body).toMatch(/pay\/sandbox\/pay-con/); // the 40% link comes next
    expect(w.store.notifications.some((n) => n.userId === STAFF.accounts.id || n.role === "accounts")).toBe(true);
  });

  it("reminds at T-7 and T-3 once each, and flags overdue payments", async () => {
    const at = (d: string) => testWorld({ now: new Date(`${d}T04:30:00Z`) });
    const w7 = at("2026-10-10");
    seedWedding(w7, { paid: ["deposit"] });
    const a = await sendPaymentReminders(w7.deps);
    const b = await sendPaymentReminders(w7.deps);
    expect(a.status === "done" && a.result.reminders).toBe(1);
    expect(b.status === "done" && b.result.reminders).toBe(0);
    expect(w7.store.messages[0]!.body).toMatch(/due on/);

    const late = at("2026-10-20");
    seedWedding(late, { paid: ["deposit"] });
    const c = await sendPaymentReminders(late.deps);
    expect(c.status === "done" && c.result.overdue).toBe(1);
    expect(late.db.rows("payments").find((p) => p.id === "pay-con")).toMatchObject({ status: "overdue" });
    expect(late.store.messages.filter((m) => m.status === "pending_approval")).toHaveLength(0);
  });

  it("without live e-sign or payments, sends no test links and tells the family their event manager will follow up", async () => {
    const w = testWorld();
    w.deps.channels = createIntegrations({ NEXT_PUBLIC_APP_URL: "https://wiwaha.test" });
    seedWedding(w);
    const d = await draftContract(w.deps, "wd1");
    if (d.status !== "done") throw new Error("draft failed");
    decide(w, d.result.approvalId);
    await onContractDecided(w.deps, d.result.approvalId, "approved");
    const body = w.store.messages.at(-1)!.body;
    expect(body).not.toMatch(/sandbox|https?:\/\//);
    expect(body).toMatch(/event manager will share the contract/);
    expect(w.db.rows("payments").find((p) => p.id === "pay-dep")!.link_url).toBeNull();
  });
});
