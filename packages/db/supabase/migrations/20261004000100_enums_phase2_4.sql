-- =============================================================================
-- Wiwaha OS · 0012 · New enum values for Phases 2–4
-- Kept in their own migration: Postgres can't use a new enum value in the same
-- transaction that adds it, and every migration file runs in one transaction.
-- =============================================================================
alter type public.lead_source add value if not exists 'web_chat';
alter type public.message_channel add value if not exists 'web_chat';

alter type public.approval_kind add value if not exists 'visit_message';
alter type public.approval_kind add value if not exists 'moodboard';
alter type public.approval_kind add value if not exists 'menu';
alter type public.approval_kind add value if not exists 'vendor_message';
alter type public.approval_kind add value if not exists 'invoice';
alter type public.approval_kind add value if not exists 'deposit_decision';
alter type public.approval_kind add value if not exists 'run_of_show';
alter type public.approval_kind add value if not exists 't_minus_plan';
