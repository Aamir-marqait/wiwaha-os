-- =============================================================================
-- Wiwaha OS · 0011 · Pin search_path on every function that didn't set one
-- Supabase's security advisor (lint 0011) flags functions whose search_path
-- the caller can change. Pinning it stops a malicious schema earlier on the
-- path from shadowing the tables and helpers these functions call.
-- =============================================================================
alter function app.touch_updated_at() set search_path = pg_catalog, public, app;
alter function app.is_service() set search_path = pg_catalog, public, app;
alter function app.request_headers() set search_path = pg_catalog, public, app;
alter function app.client_ip() set search_path = pg_catalog, public, app;
alter function app.enable_audit(regclass) set search_path = pg_catalog, public, app;
alter function app.normalise_phone(text) set search_path = pg_catalog, public, app;

alter function public.place_hold(public.resource_kind, uuid, date, date, uuid, integer, text, text) set search_path = pg_catalog, public, app;
alter function public.set_calendar_status(uuid, public.calendar_status, text, uuid) set search_path = pg_catalog, public, app;
alter function public.availability(date, date) set search_path = pg_catalog, public, app;
alter function public.release_expired_holds() set search_path = pg_catalog, public, app;
alter function public.ingest_lead(jsonb) set search_path = pg_catalog, public, app;
alter function public.start_stage(uuid) set search_path = pg_catalog, public, app;
alter function public.snooze_stage(uuid, date, text) set search_path = pg_catalog, public, app;
alter function public.decide_approval(uuid, public.approval_status, jsonb, text) set search_path = pg_catalog, public, app;
alter function public.my_role() set search_path = pg_catalog, public, app;
alter function public.update_policy(text, text, jsonb, text, boolean) set search_path = pg_catalog, public, app;
