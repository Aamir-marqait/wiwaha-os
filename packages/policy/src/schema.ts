import { z } from "zod";

/**
 * Structured parameters for every rule in the policy book.
 * The `rule_text` is what agents read and quote; `value` is what code reads.
 * Both live in the `policies` table and are editable by the owner.
 */

const paise = z.number().int().nonnegative();
const stageUnlock = z.enum(["none", "deposit_paid", "brief_started", "contract_paid", "quote_approved", "event_complete"]);

export const policySchemas = {
  "honesty.commitments": z.object({
    escalate_unknown: z.boolean(),
    never_promise: z.array(z.string()),
  }),
  "pricing.phone": z.object({
    quote_prices_on_phone: z.boolean(),
    invite_to_visit: z.boolean(),
    out_of_town_band: z.object({
      enabled: z.boolean(),
      // null until Prashanth approves a band (PRD §14) — agents must then escalate.
      starting_from_paise: paise.nullable(),
      label: z.string(),
    }),
    // A caller counts as out of town when their city is not one of these.
    local_cities: z.array(z.string()),
    send_brochure: z.boolean(),
    send_video_tour: z.boolean(),
  }),
  "discounts": z.object({
    agents_may_offer: z.boolean(),
    approver_role: z.enum(["owner"]),
  }),
  "followup.after_visit": z.object({
    calls: z.number().int().min(0).max(1),
    days_after_visit: z.number().int().positive(),
    stop_if_no_response: z.boolean(),
  }),
  "payments.schedule": z.object({
    milestones: z.array(
      z.object({
        milestone: z.string(),
        label: z.string(),
        percent_bps: z.number().int().min(0).max(10000),
        due: z.enum(["on_booking", "days_after_booking", "days_before_event"]),
        days: z.number().int().nonnegative().optional(),
        effect: z.string(),
      }),
    ),
    reminder_offsets_days: z.array(z.number().int()),
  }),
  "contract.template": z.object({
    style: z.literal("plain_black_and_white"),
    esign: z.boolean(),
    signer_for_venue: z.string(),
  }),
  "decor.providers": z.object({
    allowed: z.array(z.enum(["in_house", "designated_planner"])),
    venue_provides: z.array(z.string()),
    requires_payment_unlock: stageUnlock,
  }),
  "moodboards": z.object({
    per_function: z.number().int().positive(),
    sequence: z.array(z.enum(["broad", "detail"])),
    label_standard_vs_custom: z.boolean(),
    custom_needs_owner_approval: z.boolean(),
  }),
  "planning.start": z.object({
    recommended_days_before: z.number().int().positive(),
    allow_early_start: z.boolean(),
    respect_payment_unlock: z.boolean(),
  }),
  "portal.stage_cards": z.object({
    cards: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        unlock: stageUnlock,
        recommended_days_before: z.number().int().optional(),
        recommended_days_after: z.number().int().optional(),
        recommended_label: z.string(),
        triggers: z.string(),
        needs_from_client: z.string(),
      }),
    ),
    nudge_once_then_call: z.boolean(),
  }),
  "audit.portal_edits": z.object({
    log_user: z.boolean(),
    log_time: z.boolean(),
    log_ip: z.boolean(),
  }),
  "reviews.after_event": z.object({
    channel: z.literal("email"),
    personalised: z.boolean(),
    send_days_after_event: z.number().int().nonnegative(),
    low_score_threshold: z.number().int().min(1).max(5),
    escalate_to_role: z.literal("owner"),
    escalate_within_hours: z.number().int().positive(),
  }),
  "farewell": z.object({
    thank_you_note: z.boolean(),
    gift_options: z.array(z.string()),
    gift_budget_paise: paise.nullable(),
    add_to_newsletter: z.boolean(),
    referral_ask: z.boolean(),
  }),
  "holds.soft_hold": z.object({
    hours: z.number().int().positive(),
    auto_release: z.boolean(),
    notify_client_on_release: z.boolean(),
  }),
  "lead_scoring": z.object({
    weights: z.object({
      date_fit: z.number().nonnegative(),
      guest_fit: z.number().nonnegative(),
      budget: z.number().nonnegative(),
      source: z.number().nonnegative(),
    }),
    source_scores: z.record(z.string(), z.number().min(0).max(1)),
    ideal_guests: z.object({ min: z.number().int(), max: z.number().int() }),
    max_guests: z.number().int().positive(),
    budget_bands_paise: z.object({ low: paise, good: paise, premium: paise }),
    hot_threshold: z.number().int().min(0).max(100),
  }),
  "venue.facts": z.object({
    estate_acres: z.number().positive(),
    rooms_now: z.number().int().positive(),
    rooms_planned: z.number().int().positive(),
    airport_distance_km: z.number().positive(),
    complimentary_rooms_with_booking: z.boolean(),
    catering: z.array(z.string()),
    outside_caterer_allowed: z.boolean(),
  }),
  "visits.checklist": z.object({
    items: z.array(z.object({ key: z.string(), label: z.string() })),
    hosted_by: z.string(),
  }),
  "briefs.schedule": z.object({
    timezone: z.string(),
    morning: z.string().regex(/^\d{2}:\d{2}$/),
    evening: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  "languages": z.object({
    portal: z.array(z.enum(["en", "kn", "hi"])),
    voice: z.array(z.enum(["en", "kn", "hi", "ta", "te"])),
  }),
} as const;

export type PolicyKey = keyof typeof policySchemas;
export type PolicyValue<K extends PolicyKey> = z.infer<(typeof policySchemas)[K]>;
export const POLICY_KEYS = Object.keys(policySchemas) as PolicyKey[];

export function isPolicyKey(key: string): key is PolicyKey {
  return Object.prototype.hasOwnProperty.call(policySchemas, key);
}

/** A row from the `policies` table. */
export interface PolicyRow {
  key: string;
  topic: string;
  title: string;
  rule_text: string;
  value: unknown;
  version: number;
  client_visible: boolean;
  needs_confirmation: boolean;
  sort: number;
  owner_name?: string;
  updated_at?: string;
}

export interface PolicyRecord<K extends PolicyKey = PolicyKey> {
  key: K;
  topic: string;
  title: string;
  rule_text: string;
  value: PolicyValue<K>;
  version: number;
  client_visible: boolean;
  needs_confirmation: boolean;
  sort: number;
}
