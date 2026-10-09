import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  CallRequest,
  ESignAdapter,
  MessagingAdapter,
  OutboundMessage,
  PaymentLinkRequest,
  PaymentLinkResult,
  PaymentsAdapter,
  SendResult,
  SignatureRequest,
  SignatureResult,
  TelephonyAdapter,
} from "./types";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const sandboxRef = (prefix: string) => `sbx_${prefix}_${randomUUID().slice(0, 8)}`;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function hmacHex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function call(fetchFn: FetchLike, url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetchFn(url, init);
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { /* non-JSON body */ }
  return { ok: res.ok, status: res.status, json, text };
}

// ---------------------------------------------------------------------------
// Sandbox: records instead of delivering. Every flow works end to end.
// ---------------------------------------------------------------------------
export class SandboxMessaging implements MessagingAdapter {
  readonly provider = "sandbox";
  readonly live = false;
  constructor(private readonly kind: string) {}
  async send(_msg: OutboundMessage): Promise<SendResult> {
    return { provider: this.provider, status: "sandboxed", providerRef: sandboxRef(this.kind) };
  }
}

/** Plivo XML is used for call control in sandbox and with Plivo itself. */
export function plivoTransferXml(toE164: string, sayFirst: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Speak language="en-IN">${escapeXml(sayFirst)}</Speak><Dial timeout="25"><Number>${escapeXml(toE164)}</Number></Dial></Response>`;
}

export class SandboxTelephony implements TelephonyAdapter {
  readonly provider = "sandbox";
  readonly live = false;
  async placeCall(_req: CallRequest): Promise<SendResult> {
    return { provider: this.provider, status: "sandboxed", providerRef: sandboxRef("call") };
  }
  transferMarkup(toE164: string, sayFirst: string): string {
    return plivoTransferXml(toE164, sayFirst);
  }
}

export class SandboxPayments implements PaymentsAdapter {
  readonly provider = "sandbox";
  readonly live = false;
  /** `demoLinks` hands out the test pay page; without it no link exists (accounts record payments by hand). */
  constructor(private readonly appUrl: string, private readonly demoLinks = false) {}
  async createLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const linkId = sandboxRef("plink");
    return { provider: this.provider, status: "sandboxed", providerRef: linkId, linkId, url: this.demoLinks ? `${this.appUrl}/pay/sandbox/${req.referenceId}` : null };
  }
  verifyWebhook(): boolean {
    return false; // sandbox payments are confirmed by our own server, never by webhook
  }
}

export class SandboxESign implements ESignAdapter {
  readonly provider = "sandbox";
  readonly live = false;
  constructor(private readonly appUrl: string, private readonly demoLinks = false) {}
  async requestSignature(req: SignatureRequest): Promise<SignatureResult> {
    const id = sandboxRef("esign");
    return { provider: this.provider, status: "sandboxed", providerRef: id, requestId: id, signUrl: this.demoLinks ? `${this.appUrl}/sign/sandbox/${req.referenceId}` : null };
  }
  verifyWebhook(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Live adapters. They switch on only when their keys are set, and stay in
// test numbers / test mode until Prashanth approves going live.
// ---------------------------------------------------------------------------

/** WhatsApp Business via Gupshup. */
export class GupshupWhatsApp implements MessagingAdapter {
  readonly provider = "gupshup";
  readonly live = true;
  constructor(private readonly cfg: { apiKey: string; source: string; appName: string }, private readonly fetchFn: FetchLike) {}
  async send(msg: OutboundMessage): Promise<SendResult> {
    const to = msg.to.replace(/^\+/, "");
    const form = new URLSearchParams({ channel: "whatsapp", source: this.cfg.source.replace(/^\+/, ""), destination: to, "src.name": this.cfg.appName });
    let url = "https://api.gupshup.io/wa/api/v1/msg";
    if (msg.template) {
      url = "https://api.gupshup.io/wa/api/v1/template/msg";
      form.set("template", JSON.stringify({ id: msg.template, params: msg.templateParams ?? [] }));
    } else {
      const text = msg.location ? `${msg.body}\n\n📍 ${msg.location.name}: ${msg.location.url}` : msg.body;
      form.set("message", JSON.stringify({ type: "text", text }));
    }
    const r = await call(this.fetchFn, url, { method: "POST", headers: { apikey: this.cfg.apiKey, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    const ref = typeof r.json.messageId === "string" ? r.json.messageId : null;
    return r.ok ? { provider: this.provider, status: "sent", providerRef: ref } : { provider: this.provider, status: "failed", providerRef: null, error: `Gupshup ${r.status}: ${r.text.slice(0, 300)}` };
  }
}

/** Transactional email via Resend's HTTP API. */
export class ResendEmail implements MessagingAdapter {
  readonly provider = "resend";
  readonly live = true;
  constructor(private readonly cfg: { apiKey: string; from: string }, private readonly fetchFn: FetchLike) {}
  async send(msg: OutboundMessage): Promise<SendResult> {
    const r = await call(this.fetchFn, "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.cfg.from, to: [msg.to], subject: msg.subject ?? "Wiwaha by Praman", text: msg.body }),
    });
    const ref = typeof r.json.id === "string" ? r.json.id : null;
    return r.ok ? { provider: this.provider, status: "sent", providerRef: ref } : { provider: this.provider, status: "failed", providerRef: null, error: `Resend ${r.status}: ${r.text.slice(0, 300)}` };
  }
}

/** Instagram DMs via the Messenger Platform (page access token). */
export class InstagramMessaging implements MessagingAdapter {
  readonly provider = "instagram";
  readonly live = true;
  constructor(private readonly cfg: { pageToken: string }, private readonly fetchFn: FetchLike) {}
  async send(msg: OutboundMessage): Promise<SendResult> {
    const r = await call(this.fetchFn, `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(this.cfg.pageToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: msg.to }, message: { text: msg.body } }),
    });
    const ref = typeof r.json.message_id === "string" ? r.json.message_id : null;
    return r.ok ? { provider: this.provider, status: "sent", providerRef: ref } : { provider: this.provider, status: "failed", providerRef: null, error: `Instagram ${r.status}: ${r.text.slice(0, 300)}` };
  }
}

/** Voice calls via Plivo (answer_url returns Plivo XML from /api/voice). */
export class PlivoTelephony implements TelephonyAdapter {
  readonly provider = "plivo";
  readonly live = true;
  constructor(private readonly cfg: { authId: string; authToken: string; callerId: string }, private readonly fetchFn: FetchLike) {}
  async placeCall(req: CallRequest): Promise<SendResult> {
    const auth = Buffer.from(`${this.cfg.authId}:${this.cfg.authToken}`).toString("base64");
    const r = await call(this.fetchFn, `https://api.plivo.com/v1/Account/${this.cfg.authId}/Call/`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.cfg.callerId, to: req.to, answer_url: req.answerUrl, answer_method: "POST", hangup_url: req.statusUrl, hangup_method: "POST" }),
    });
    const uuid = Array.isArray(r.json.request_uuid) ? String(r.json.request_uuid[0]) : typeof r.json.request_uuid === "string" ? r.json.request_uuid : null;
    return r.ok ? { provider: this.provider, status: "sent", providerRef: uuid } : { provider: this.provider, status: "failed", providerRef: null, error: `Plivo ${r.status}: ${r.text.slice(0, 300)}` };
  }
  transferMarkup(toE164: string, sayFirst: string): string {
    return plivoTransferXml(toE164, sayFirst);
  }
}

/** Razorpay Payment Links (test keys until go-live). */
export class RazorpayPayments implements PaymentsAdapter {
  readonly provider = "razorpay";
  readonly live = true;
  constructor(private readonly cfg: { keyId: string; keySecret: string; webhookSecret: string | null }, private readonly fetchFn: FetchLike) {}
  async createLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const auth = Buffer.from(`${this.cfg.keyId}:${this.cfg.keySecret}`).toString("base64");
    const body: Record<string, unknown> = {
      amount: req.amountPaise,
      currency: "INR",
      description: req.description.slice(0, 2048),
      reference_id: req.referenceId,
      customer: { name: req.customer.name, ...(req.customer.email ? { email: req.customer.email } : {}), ...(req.customer.phone ? { contact: req.customer.phone } : {}) },
      notify: { sms: false, email: false }, // we send the link ourselves, after approval
      reminder_enable: false,
      notes: { payment_id: req.referenceId },
    };
    if (req.expireBy) body.expire_by = Math.floor(req.expireBy.getTime() / 1000);
    if (req.callbackUrl) { body.callback_url = req.callbackUrl; body.callback_method = "get"; }
    const r = await call(this.fetchFn, "https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { provider: this.provider, status: "failed", providerRef: null, linkId: null, url: null, error: `Razorpay ${r.status}: ${r.text.slice(0, 300)}` };
    const id = typeof r.json.id === "string" ? r.json.id : null;
    const url = typeof r.json.short_url === "string" ? r.json.short_url : null;
    return { provider: this.provider, status: "sent", providerRef: id, linkId: id, url };
  }
  verifyWebhook(rawBody: string, signature: string | null): boolean {
    if (!this.cfg.webhookSecret || !signature) return false;
    return safeEqualHex(hmacHex(this.cfg.webhookSecret, rawBody), signature);
  }
}

// ---------------------------------------------------------------------------
// Picks live adapters where keys exist, sandbox everywhere else.
// ---------------------------------------------------------------------------
export interface IntegrationEnv {
  [key: string]: string | undefined;
}

export function sandboxFor(appUrl: string, demoLinks = false) {
  return {
    whatsapp: new SandboxMessaging("wa"),
    email: new SandboxMessaging("email"),
    sms: new SandboxMessaging("sms"),
    instagram: new SandboxMessaging("ig"),
    telephony: new SandboxTelephony(),
    payments: new SandboxPayments(appUrl, demoLinks),
    esign: new SandboxESign(appUrl, demoLinks),
  };
}

export function createIntegrations(env: IntegrationEnv, fetchFn: FetchLike = fetch as unknown as FetchLike) {
  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  // ALLOW_SANDBOX_LINKS=true is for demos only: it turns on the test pay and sign pages, which mark things paid/signed without checks.
  const sb = sandboxFor(appUrl, env.ALLOW_SANDBOX_LINKS === "true");
  const whatsapp = env.WHATSAPP_BSP === "gupshup" && env.WHATSAPP_API_KEY && env.WHATSAPP_SENDER_NUMBER && env.GUPSHUP_APP_NAME
    ? new GupshupWhatsApp({ apiKey: env.WHATSAPP_API_KEY, source: env.WHATSAPP_SENDER_NUMBER, appName: env.GUPSHUP_APP_NAME }, fetchFn)
    : sb.whatsapp;
  const email = env.RESEND_API_KEY && env.EMAIL_FROM ? new ResendEmail({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }, fetchFn) : sb.email;
  const instagram = env.META_PAGE_ACCESS_TOKEN ? new InstagramMessaging({ pageToken: env.META_PAGE_ACCESS_TOKEN }, fetchFn) : sb.instagram;
  const telephony = env.TELEPHONY_PROVIDER === "plivo" && env.PLIVO_AUTH_ID && env.PLIVO_AUTH_TOKEN && env.PLIVO_NUMBER
    ? new PlivoTelephony({ authId: env.PLIVO_AUTH_ID, authToken: env.PLIVO_AUTH_TOKEN, callerId: env.PLIVO_NUMBER }, fetchFn)
    : sb.telephony;
  const payments = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
    ? new RazorpayPayments({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? null }, fetchFn)
    : sb.payments;
  // E-sign providers need a PDF upload; until a provider account exists the
  // sandbox signing page stands in (see docs/decisions.md D23).
  const voiceUrl = (path: string, params: Record<string, string>) => `${appUrl}${path}?${new URLSearchParams({ ...params, k: env.WEBHOOK_SECRET ?? "" }).toString()}`;
  return { whatsapp, email, sms: sb.sms, instagram, telephony, payments, esign: sb.esign, appUrl, voiceUrl };
}
