-- =============================================================================
-- The agents' 15-minute tick, scheduled from inside Postgres (decision D23).
-- Vercel Hobby only allows daily crons, so pg_cron + pg_net call
-- /api/cron/tick every 15 minutes. The URL and CRON_SECRET live in Supabase
-- Vault (never in this file):
--   select vault.create_secret('https://<app>.vercel.app', 'wiwaha_app_url');
--   select vault.create_secret('<CRON_SECRET>', 'wiwaha_cron_secret');
-- Until both secrets exist the job does nothing. Skipped where pg_cron,
-- pg_net or Vault aren't installed (the local test database).
-- =============================================================================
create or replace function app.call_tick() returns void
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_url text; v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'wiwaha_app_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'wiwaha_cron_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then return; end if;
  execute 'select net.http_get(url := $1, headers := $2, timeout_milliseconds := 290000)'
    using rtrim(v_url, '/') || '/api/cron/tick', jsonb_build_object('Authorization', 'Bearer ' || v_secret);
end $$;
revoke execute on function app.call_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('wiwaha-agent-tick', '*/15 * * * *', 'select app.call_tick()');
  else
    raise notice 'pg_cron not installed: call /api/cron/tick from another scheduler';
  end if;
exception when others then
  raise notice 'Skipping tick schedule: %', sqlerrm;
end $$;
