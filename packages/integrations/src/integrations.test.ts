import { describe, expect, it } from "vitest";
import {
  createIntegrations,
  hmacHex,
  parseGoogleAdsLead,
  parseGupshupInbound,
  parseGuestCount,
  parseLooseDate,
  parseMetaLeadFields,
  parseMetaWebhook,
  parseWedMeGoodEmail,
  RazorpayPayments,
  toIngestPayload,
  verifyMetaSignature,
} from "./index";

describe("dates and guest counts", () => {
  it.each([
    ["14 March 2027", "2027-03-14"],
    ["14th March, 2027", "2027-03-14"],
    ["14/03/2027", "2027-03-14"],
    ["2027-03-14", "2027-03-14"],
    ["March 14, 2027", "2027-03-14"],
    ["sometime next year", null],
  ])("%s → %s", (raw, iso) => expect(parseLooseDate(raw)).toBe(iso));
  it("takes the upper bound of a range", () => expect(parseGuestCount("200-250 guests")).toBe(250));
});

describe("WhatsApp (Gupshup)", () => {
  it("turns an inbound text into a lead with the sender's number", () => {
    const lead = parseGupshupInbound({
      app: "wiwaha", type: "message", version: 2,
      payload: { id: "ABEG91", source: "919845012345", type: "text", payload: { text: "Is 14 March 2027 free for 250 guests?" }, sender: { phone: "919845012345", name: "Kiran" } },
    });
    expect(lead).toMatchObject({ source: "whatsapp", phone: "+919845012345", fullName: "Kiran", dateWanted: "2027-03-14", replyTo: "+919845012345" });
  });
  it("ignores delivery receipts", () => expect(parseGupshupInbound({ type: "message-event", payload: {} })).toBeNull());
});

describe("Meta", () => {
  const secret = "app-secret";
  it("verifies the X-Hub-Signature-256 header", () => {
    const raw = JSON.stringify({ object: "instagram" });
    expect(verifyMetaSignature(raw, `sha256=${hmacHex(secret, raw)}`, secret)).toBe(true);
    expect(verifyMetaSignature(raw, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyMetaSignature(raw, `sha256=${hmacHex(secret, raw)}`, undefined)).toBe(false);
  });
  it("reads Instagram DMs and lead-form events from one webhook, skipping echoes", () => {
    const out = parseMetaWebhook({
      object: "instagram",
      entry: [
        { messaging: [
          { sender: { id: "ig-123" }, message: { mid: "m1", text: "Hi, rates for 300 guests in Dec 2027?" } },
          { sender: { id: "page" }, message: { mid: "m2", text: "echo", is_echo: true } },
        ] },
        { changes: [{ field: "leadgen", value: { leadgen_id: "L1", form_id: "F1", page_id: "P1" } }] },
      ],
    });
    expect(out.dms).toHaveLength(1);
    expect(out.dms[0]).toMatchObject({ source: "instagram", replyTo: "ig-123", guestCount: 300 });
    expect(out.leadgen).toEqual([{ leadgenId: "L1", formId: "F1", pageId: "P1" }]);
  });
  it("maps lead-form fields", () => {
    const lead = parseMetaLeadFields("L1", [
      { name: "full_name", values: ["Divya Rao"] },
      { name: "phone_number", values: ["+919812300000"] },
      { name: "wedding_date", values: ["2027-12-05"] },
      { name: "guest_count", values: ["300"] },
    ], "Wedding enquiry");
    expect(lead).toMatchObject({ source: "meta_form", fullName: "Divya Rao", dateWanted: "2027-12-05", guestCount: 300, sourceDetail: "Meta form: Wedding enquiry" });
  });
});

describe("Google Ads lead forms", () => {
  const body = { lead_id: "G1", google_key: "k", campaign_id: 99, user_column_data: [
    { column_id: "FULL_NAME", string_value: "Arjun S" }, { column_id: "PHONE_NUMBER", string_value: "+919800011111" }, { column_id: "EMAIL", string_value: "a@x.in" },
  ] };
  it("accepts a lead with the right key", () => expect(parseGoogleAdsLead(body, "k")).toMatchObject({ source: "google_ads", fullName: "Arjun S", phone: "+919800011111" }));
  it("rejects the wrong key", () => expect(parseGoogleAdsLead(body, "other")).toBeNull());
});

describe("WedMeGood emails", () => {
  it("parses the labelled lines", () => {
    const lead = parseWedMeGoodEmail({
      messageId: "<abc@wmg>", subject: "New enquiry for Wiwaha by Praman",
      text: "You have a new lead!\nName: Pooja Menon\nPhone: 98450 77777\nEmail: pooja@example.com\nCity: Bengaluru\nEvent Date: 20/11/2027\nNo. of Guests: 200-250\nBudget: 30-40 Lakhs\nMessage: Looking for a lawn wedding",
    });
    expect(lead).toMatchObject({ source: "wedmegood", fullName: "Pooja Menon", phone: "98450 77777", dateWanted: "2027-11-20", guestCount: 250, budgetText: "30-40 Lakhs" });
    expect(toIngestPayload(lead!)).toMatchObject({ source: "wedmegood", external_ref: "wedmegood:<abc@wmg>" });
  });
  it("returns null when there is no way to reach the family", () => expect(parseWedMeGoodEmail({ messageId: "x", text: "Name: Someone" })).toBeNull());
});

describe("adapter selection", () => {
  it("runs entirely in sandbox without keys", async () => {
    const i = createIntegrations({ NEXT_PUBLIC_APP_URL: "https://wiwaha-os.vercel.app/" });
    expect([i.whatsapp.live, i.email.live, i.telephony.live, i.payments.live, i.esign.live]).toEqual([false, false, false, false, false]);
    const link = await i.payments.createLink({ amountPaise: 450000_00, description: "Deposit", referenceId: "pay-1", customer: { name: "A" } });
    // No test pay page unless the demo switch is on: nobody can mark a payment paid by visiting a link.
    expect(link).toMatchObject({ status: "sandboxed", url: null });
    const demo = createIntegrations({ NEXT_PUBLIC_APP_URL: "https://wiwaha-os.vercel.app/", ALLOW_SANDBOX_LINKS: "true" });
    expect(await demo.payments.createLink({ amountPaise: 1, description: "x", referenceId: "pay-1", customer: { name: "A" } })).toMatchObject({ url: "https://wiwaha-os.vercel.app/pay/sandbox/pay-1" });
    expect((await i.esign.requestSignature({ documentTitle: "c", documentHtml: "", referenceId: "c1", signers: [] })).signUrl).toBeNull();
    expect((await i.whatsapp.send({ to: "+919800000000", body: "hi" })).status).toBe("sandboxed");
  });
  it("switches to live adapters only when their keys are present", () => {
    const i = createIntegrations({ RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s", WHATSAPP_BSP: "gupshup", WHATSAPP_API_KEY: "k" });
    expect(i.payments.provider).toBe("razorpay");
    expect(i.whatsapp.provider).toBe("sandbox"); // sender number + app name missing
  });
  it("Razorpay webhook signatures are checked against the webhook secret", () => {
    const rp = new RazorpayPayments({ keyId: "k", keySecret: "s", webhookSecret: "whsec" }, fetch as never);
    const raw = '{"event":"payment_link.paid"}';
    expect(rp.verifyWebhook(raw, hmacHex("whsec", raw))).toBe(true);
    expect(rp.verifyWebhook(raw, hmacHex("other", raw))).toBe(false);
  });
  it("sends Razorpay payment links with notify off (we send after approval)", async () => {
    let sent: Record<string, unknown> = {};
    const fakeFetch = async (_u: string, init: { body: string }) => { sent = JSON.parse(init.body) as Record<string, unknown>; return { ok: true, status: 200, text: async () => '{"id":"plink_1","short_url":"https://rzp.io/i/x"}' }; };
    const rp = new RazorpayPayments({ keyId: "k", keySecret: "s", webhookSecret: null }, fakeFetch as never);
    const r = await rp.createLink({ amountPaise: 100, description: "d", referenceId: "p1", customer: { name: "n", phone: "+91" } });
    expect(r).toMatchObject({ status: "sent", url: "https://rzp.io/i/x" });
    expect(sent).toMatchObject({ amount: 100, currency: "INR", reference_id: "p1", notify: { sms: false, email: false } });
  });
});

import { parseCsv, parseLeadCsv } from "./csv";
describe("CSV lead import", () => {
  it("reads Meta Lead Center style exports (tab separated, quoted fields)", () => {
    const text = 'created_time\tfull_name\tphone_number\temail\tcity\twedding_date\tguests\n2026-10-05T10:00:00\tPriya Natarajan\tp:+919900011103\tpriya@example.com\tBengaluru\t14 March 2027\t300 guests\n2026-10-05T11:00:00\t\t\t\t\t\t';
    const r = parseLeadCsv(text, "meta_form");
    expect(r.errors).toEqual([{ line: 3, reason: "Missing name" }]);
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0]).toMatchObject({ fullName: "Priya Natarajan", phone: "+919900011103", city: "Bengaluru", dateWanted: "2027-03-14", guestCount: 300, source: "meta_form" });
  });
  it("handles commas inside quotes, Google-style headers and unmatched columns", () => {
    const text = 'Full Name,Phone Number,Email,Notes,Campaign\n"Rao, Meera",9845012345,,"Hall for 200, Feb",Search wedding';
    const r = parseLeadCsv(text, "google_form");
    expect(r.leads[0]).toMatchObject({ fullName: "Rao, Meera", phone: "+919845012345", email: null });
    expect(r.leads[0]!.message).toBe("Hall for 200, Feb · campaign: Search wedding");
    expect(parseCsv('a,b\n"x ""y""",2')[1]).toEqual(['x "y"', "2"]);
  });
  it("explains a file with no name or contact column", () => {
    expect(parseLeadCsv("foo,bar\n1,2", "meta_form").errors[0]!.reason).toMatch(/No name column/);
  });
});
