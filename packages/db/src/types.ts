/**
 * Row types for the tables the app and agents touch. Kept by hand to match
 * packages/db/supabase/migrations. When a Supabase project is linked you can
 * also run `supabase gen types typescript --linked > src/generated.ts`.
 */

export type AppRole = "owner" | "sales" | "event_manager" | "staff" | "accounts" | "client" | "vendor" | "agent";
export const STAFF_ROLES: readonly AppRole[] = ["owner", "sales", "event_manager", "staff", "accounts"];
export type LanguageCode = "en" | "kn" | "hi" | "ta" | "te";

export type LeadSource =
  | "website" | "manual" | "phone" | "whatsapp" | "instagram" | "facebook" | "meta_form"
  | "google_form" | "google_ads" | "wedmegood" | "referral" | "walk_in" | "other" | "web_chat";
export const LEAD_SOURCES: readonly LeadSource[] = [
  "website", "manual", "phone", "whatsapp", "instagram", "facebook", "meta_form",
  "google_form", "google_ads", "wedmegood", "referral", "walk_in", "other", "web_chat",
];
export type LeadStatus =
  | "new" | "contacted" | "visit_booked" | "visited" | "follow_up_done" | "negotiating" | "won" | "lost" | "no_response";
export type EventType = "wedding" | "reception" | "engagement" | "pre_wedding" | "corporate" | "family_function" | "other";

export type CalendarStatus = "enquiry" | "held" | "confirmed" | "released";
export type ResourceKind = "space" | "room";
export type AgentAutonomy = "draft" | "act_and_notify" | "act_silently";
export type AgentActionStatus = "ok" | "gated" | "blocked" | "escalated" | "error" | "fallback" | "skipped_disabled";
export type ApprovalKind =
  | "lead_reply" | "client_message" | "discount" | "contract" | "quote" | "quote_line" | "custom_decor"
  | "vendor_payment" | "ad_budget" | "purchase" | "brief" | "social_post" | "review_reply" | "policy_answer" | "other"
  | "visit_message" | "moodboard" | "menu" | "vendor_message" | "invoice" | "deposit_decision" | "run_of_show" | "t_minus_plan";
export type ApprovalStatus = "pending" | "approved" | "edited" | "rejected" | "expired";
export type StageStatus = "locked" | "not_started" | "in_progress" | "awaiting_client" | "done" | "snoozed";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type MessageChannel = "whatsapp" | "email" | "sms" | "instagram" | "portal" | "phone" | "internal" | "web_chat";
export type MessageStatus =
  | "draft" | "pending_approval" | "approved" | "queued" | "sent" | "delivered" | "read" | "failed" | "rejected" | "received";
export type PaymentStatus = "scheduled" | "link_sent" | "paid" | "overdue" | "waived" | "refunded" | "cancelled";
export type WeddingStage = "booking" | "onboarding" | "planning" | "final_payment" | "execution" | "close_out" | "offboarding";
export type HumanQueueReason = "agent_disabled" | "escalation" | "guardrail" | "error" | "off_policy";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Profile {
  id: string;
  email: string | null;
  full_name: string;
  phone_e164: string | null;
  role: AppRole;
  active: boolean;
  preferred_language: LanguageCode;
  title: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  full_name: string;
  phone_e164: string | null;
  email: string | null;
  role: string;
  city: string | null;
  preferred_language: LanguageCode;
  consent_whatsapp: boolean;
  consent_email: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  contact_id: string;
  source: LeadSource;
  source_detail: string | null;
  event_type: EventType;
  date_wanted: string | null;
  date_flexible: boolean;
  alt_dates: string[];
  guest_count: number | null;
  budget_paise: number | null;
  budget_text: string | null;
  rooms_needed: number | null;
  city: string | null;
  message: string | null;
  score: number | null;
  score_breakdown: Json | null;
  hot: boolean;
  status: LeadStatus;
  assigned_to: string | null;
  hold_expires_at: string | null;
  wedding_id: string | null;
  touch_count: number;
  first_touch_at: string;
  last_touch_at: string;
  created_at: string;
}

export interface LeadWithContact extends Lead {
  contact: Pick<Contact, "id" | "full_name" | "phone_e164" | "email" | "city"> | null;
}

export interface Space {
  id: string;
  name: string;
  kind: "indoor" | "outdoor" | "semi_open";
  capacity_seated: number;
  capacity_floating: number | null;
  description: string | null;
  color: string | null;
  sort: number;
  active: boolean;
}

export interface Room {
  id: string;
  number: string;
  room_type: string;
  capacity: number;
  status: "available" | "maintenance" | "out_of_service";
  sort: number;
  active: boolean;
}

export interface CalendarEntry {
  id: string;
  resource_kind: ResourceKind;
  space_id: string | null;
  room_id: string | null;
  starts_on: string;
  ends_on: string;
  status: CalendarStatus;
  label: string | null;
  lead_id: string | null;
  wedding_id: string | null;
  expires_at: string | null;
  released_at: string | null;
  release_reason: string | null;
  created_at: string;
}

export interface AvailabilityRow {
  resource_kind: ResourceKind;
  resource_id: string;
  resource_name: string;
  capacity: number;
  day: string;
  status: CalendarStatus | null;
  entry_id: string | null;
  label: string | null;
  expires_at: string | null;
}

export interface AgentRow {
  key: string;
  name: string;
  vertical: "all" | "sales_marketing" | "event_crm" | "operations";
  job: string;
  human_gate: string;
  phase: number;
  implemented: boolean;
  enabled: boolean;
  autonomy: AgentAutonomy;
  model: string;
  config: Json;
  updated_at: string;
}

export interface AgentActionRow {
  id: string;
  agent_key: string;
  run_id: string;
  action: string;
  status: AgentActionStatus;
  lead_id: string | null;
  wedding_id: string | null;
  input: Json;
  output: Json;
  tools_used: string[];
  policy_keys: string[];
  policy_versions: Json;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd_micros: number | null;
  duration_ms: number | null;
  approval_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  error: string | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  kind: ApprovalKind;
  title: string;
  summary: string | null;
  agent_key: string | null;
  agent_action_id: string | null;
  lead_id: string | null;
  wedding_id: string | null;
  payload: Json;
  edited_payload: Json | null;
  status: ApprovalStatus;
  priority: number;
  guardrail_flags: string[];
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  lead_id: string | null;
  wedding_id: string | null;
  channel: MessageChannel;
  direction: "inbound" | "outbound" | "internal";
  status: MessageStatus;
  author_kind: "agent" | "staff" | "client" | "contact" | "system";
  agent_key: string | null;
  approval_id: string | null;
  subject: string | null;
  body: string;
  created_at: string;
}

export interface Wedding {
  id: string;
  code: string;
  title: string;
  lead_id: string | null;
  event_start: string;
  event_end: string;
  guest_count: number | null;
  stage: WeddingStage;
  status: "tentative" | "active" | "completed" | "cancelled";
  event_manager_id: string | null;
  contract_value_paise: number | null;
  booked_on: string | null;
  complimentary_rooms: number;
}

export interface WeddingStageRow {
  id: string;
  wedding_id: string;
  key: string;
  name: string;
  sort: number;
  recommended_start: string | null;
  unlock_rule: string;
  status: StageStatus;
  started_at: string | null;
  owner_label: string | null;
  needs_from_client: string | null;
  snoozed_until: string | null;
}

export interface Payment {
  id: string;
  wedding_id: string;
  milestone: string;
  label: string;
  percent_bps: number | null;
  amount_paise: number;
  due_on: string;
  status: PaymentStatus;
  paid_at: string | null;
}

export interface Task {
  id: string;
  scope: "wedding" | "estate" | "sales" | "admin";
  wedding_id: string | null;
  lead_id: string | null;
  title: string;
  owner_id: string | null;
  owner_role: AppRole | null;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  proof_kind: "none" | "tick" | "photo" | "file";
  completed_at: string | null;
}

export interface Visit {
  id: string;
  lead_id: string;
  visit_number: number;
  scheduled_at: string;
  executive_id: string | null;
  attendees: string | null;
  status: "scheduled" | "completed" | "no_show" | "cancelled" | "rescheduled";
  follow_up_due_at: string | null;
  follow_up_outcome: string;
}

export interface HumanQueueRow {
  id: string;
  agent_key: string | null;
  reason: HumanQueueReason;
  title: string;
  detail: string | null;
  payload: Json;
  lead_id: string | null;
  wedding_id: string | null;
  status: "open" | "claimed" | "done";
  created_at: string;
}

export interface BriefRow {
  id: string;
  kind: "morning" | "evening";
  for_date: string;
  recipient_id: string | null;
  title: string;
  content_md: string;
  data: Json;
  agent_action_id: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  at: string;
  user_id: string | null;
  actor_role: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  changed_fields: string[] | null;
  old_data: Json | null;
  new_data: Json | null;
  ip: string | null;
  user_agent: string | null;
  via: string | null;
}

export interface IngestLeadResult {
  lead_id: string;
  contact_id: string;
  is_new_lead: boolean;
  is_new_contact: boolean;
}
