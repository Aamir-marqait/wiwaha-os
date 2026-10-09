import "server-only";

export type ChannelMode = "live" | "manual" | "sandbox" | "ready";
export interface ChannelInfo {
  key: string;
  name: string;
  purpose: string;
  /** Environment variable names that switch it on (never values). */
  envKeys: string[];
  /** Any one of these groups being fully set means live. */
  mode: ChannelMode;
  needs: string;
  leadTime: string;
  fallback: string;
}

const has = (...keys: string[]) => keys.every((k) => !!process.env[k]);

/** Where each outside dependency stands right now, and what it takes to turn on. */
export function channelStatus(): ChannelInfo[] {
  return [
    { key: "website", name: "Website enquiry form and chat", purpose: "Leads from the Wiwaha website", envKeys: [], mode: "ready", needs: "Nothing: it posts to this app. Add your website's address to LEAD_FORM_ALLOWED_ORIGINS if the form is on another domain.", leadTime: "Same day", fallback: "—" },
    { key: "email", name: "Email (Resend)", purpose: "Receipts, invoices, welcome letters, review forms, vendor requests", envKeys: ["RESEND_API_KEY", "EMAIL_FROM"], mode: has("RESEND_API_KEY", "EMAIL_FROM") ? "live" : "manual", needs: "A Resend account and a verified sending domain (DNS records).", leadTime: "About a day", fallback: "Approved emails wait in Outbox; one tap opens your mail app with the text filled in." },
    { key: "whatsapp", name: "WhatsApp Business (Gupshup)", purpose: "Replies, reminders, receipts, staff alerts", envKeys: ["WHATSAPP_API_KEY", "WHATSAPP_SENDER_NUMBER", "GUPSHUP_APP_NAME"], mode: has("WHATSAPP_API_KEY", "WHATSAPP_SENDER_NUMBER", "GUPSHUP_APP_NAME") && process.env.WHATSAPP_BSP === "gupshup" ? "live" : "manual", needs: "A WhatsApp Business provider account, a verified Meta business, a dedicated number and approved message templates.", leadTime: "Days to weeks", fallback: "Approved messages wait in Outbox; one tap opens WhatsApp with the text filled in, and you mark it sent." },
    { key: "phone", name: "Phone concierge (Plivo)", purpose: "Answers calls 24×7, books visits, follow-up call", envKeys: ["PLIVO_AUTH_ID", "PLIVO_AUTH_TOKEN", "PLIVO_NUMBER", "WEBHOOK_SECRET"], mode: has("PLIVO_AUTH_ID", "PLIVO_AUTH_TOKEN", "PLIVO_NUMBER") && process.env.TELEPHONY_PROVIDER === "plivo" ? "live" : "sandbox", needs: "A Plivo account and an Indian number (business KYC).", leadTime: "Days to weeks", fallback: "Rehearse calls on the Phone page; calls are returned by hand from lead pages." },
    { key: "meta_leads", name: "Meta lead forms and Instagram DMs", purpose: "Instagram and Facebook enquiries", envKeys: ["META_APP_SECRET", "META_VERIFY_TOKEN", "META_PAGE_ACCESS_TOKEN"], mode: has("META_APP_SECRET", "META_VERIFY_TOKEN", "META_PAGE_ACCESS_TOKEN") ? "live" : "manual", needs: "A Meta app with app review (leads and messaging permissions) and business verification.", leadTime: "Weeks", fallback: "Export leads from Meta Lead Center and import the CSV; log DMs by hand." },
    { key: "google_leads", name: "Google Ads lead forms", purpose: "Enquiries from Google Ads lead form extensions", envKeys: ["GOOGLE_ADS_WEBHOOK_KEY"], mode: has("GOOGLE_ADS_WEBHOOK_KEY") ? "live" : "manual", needs: "Paste this app's webhook URL and a key into the lead form extension in Google Ads. No developer token needed.", leadTime: "Minutes", fallback: "Download leads from Google Ads and import the CSV." },
    { key: "ads_reporting", name: "Meta and Google Ads spend", purpose: "Ads report: cost per enquiry and per booking", envKeys: [], mode: "manual", needs: "Meta Marketing API (app review) and a Google Ads developer token (Basic access), planned for later.", leadTime: "Weeks", fallback: "Paste daily spend as CSV on the Marketing page." },
    { key: "payments", name: "Razorpay payment links", purpose: "10% / 40% / 50% payment links and receipts", envKeys: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"], mode: has("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET") ? "live" : "manual", needs: "A Razorpay account with KYC complete (test keys work straight away). Planned for later.", leadTime: "Days (KYC)", fallback: "Accounts records each bank or UPI payment on the wedding page; receipts and unlocks follow automatically." },
    { key: "esign", name: "E-signature (Digio or Leegality)", purpose: "Contract signing", envKeys: ["DIGIO_CLIENT_ID", "LEEGALITY_API_KEY"], mode: "sandbox", needs: "A Digio or Leegality account. Planned for later; no live adapter is built yet.", leadTime: "Days", fallback: "Test signing page only; sign the printed contract and mark it signed." },
    { key: "claude", name: "Claude API (the agents)", purpose: "Writes drafts and answers; templates are used without it", envKeys: ["ANTHROPIC_API_KEY"], mode: has("ANTHROPIC_API_KEY") ? "live" : "sandbox", needs: "An Anthropic API key (pay as you go).", leadTime: "Minutes", fallback: "Deterministic templates." },
  ];
}
