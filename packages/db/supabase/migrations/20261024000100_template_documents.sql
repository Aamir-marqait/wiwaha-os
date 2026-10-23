-- =============================================================================
-- Wiwaha OS · A PDF (or other document) on each décor template
-- The team can attach a deck or brief to a template; it shows beside the photos.
-- =============================================================================
alter table public.decor_templates add column if not exists document_url text
  check (document_url is null or document_url ~ '^https://');
