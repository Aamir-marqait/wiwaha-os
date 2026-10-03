/**
 * Channel adapters. Every outside service sits behind one of these
 * interfaces, so agents and routes never talk to a vendor SDK directly, and
 * the whole system runs in sandbox mode until real keys are added.
 */

export type OutboundKind = "whatsapp" | "email" | "sms" | "instagram" | "call" | "payment_link" | "esign" | "web_chat";

export interface SendResult {
  provider: string;
  /** 'sandboxed' when no provider is configured: recorded, not delivered. */
  status: "sent" | "sandboxed" | "failed";
  providerRef: string | null;
  error?: string;
}

export interface OutboundMessage {
  to: string; // E.164 phone for WhatsApp/SMS, email address, IG user id
  body: string;
  subject?: string;
  /** Pre-approved WhatsApp template name, required outside the 24-hour window. */
  template?: string;
  templateParams?: string[];
  location?: { name: string; url: string } | null;
}

export interface MessagingAdapter {
  readonly provider: string;
  readonly live: boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
}

export interface CallRequest {
  to: string;
  /** Our webhook that drives the conversation (Plivo/Exotel fetch it when the call connects). */
  answerUrl: string;
  statusUrl?: string;
  purpose: "follow_up" | "callback" | "reminder";
  record: boolean;
}

export interface TelephonyAdapter {
  readonly provider: string;
  readonly live: boolean;
  placeCall(req: CallRequest): Promise<SendResult>;
  /** Bridges a live call to a human; returns provider markup to play. */
  transferMarkup(toE164: string, sayFirst: string): string;
}

export interface PaymentLinkRequest {
  amountPaise: number;
  description: string;
  referenceId: string; // our payments.id
  customer: { name: string; email?: string | null; phone?: string | null };
  expireBy?: Date;
  callbackUrl?: string;
}

export interface PaymentLinkResult extends SendResult {
  linkId: string | null;
  url: string | null;
}

export interface PaymentsAdapter {
  readonly provider: string;
  readonly live: boolean;
  createLink(req: PaymentLinkRequest): Promise<PaymentLinkResult>;
  /** True when the webhook body really came from the gateway. */
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}

export interface SignatureRequest {
  documentTitle: string;
  documentHtml: string;
  referenceId: string; // our contracts.id
  signers: { name: string; email?: string | null; phone?: string | null }[];
}

export interface SignatureResult extends SendResult {
  requestId: string | null;
  signUrl: string | null;
}

export interface ESignAdapter {
  readonly provider: string;
  readonly live: boolean;
  requestSignature(req: SignatureRequest): Promise<SignatureResult>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}

export interface Integrations {
  whatsapp: MessagingAdapter;
  email: MessagingAdapter;
  sms: MessagingAdapter;
  instagram: MessagingAdapter;
  telephony: TelephonyAdapter;
  payments: PaymentsAdapter;
  esign: ESignAdapter;
  /** Base URL of this app, for links and webhook callbacks. */
  appUrl: string;
  /** Our voice webhook URLs, carrying the shared webhook key (agents never see secrets). */
  voiceUrl: (path: string, params: Record<string, string>) => string;
}

/** A lead parsed out of any inbound channel, ready for app.ingest_lead. */
export interface InboundLead {
  source: "whatsapp" | "instagram" | "meta_form" | "google_ads" | "google_form" | "wedmegood" | "web_chat" | "website" | "phone";
  externalId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  dateWanted: string | null; // YYYY-MM-DD
  guestCount: number | null;
  budgetText: string | null;
  message: string | null;
  sourceDetail: string | null;
  /** Channel-specific address to reply to (IG sender id, WhatsApp number). */
  replyTo: string | null;
  raw: unknown;
}
