-- =============================================================================
-- Wiwaha OS · 0008 · Scheduled jobs inside Postgres
-- Expired soft holds are released every 15 minutes by pg_cron (Supabase ships
-- the extension; enable it under Database → Extensions if this is skipped).
-- Agent jobs (8:30 am brief) run from Vercel Cron instead — see vercel.json.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('release-expired-holds', '*/15 * * * *', 'select app.release_expired_holds()');
  else
    raise notice 'pg_cron not available: expired holds are still released before every new hold and by /api/cron/holds';
  end if;
exception when others then
  raise notice 'Skipping pg_cron schedule: %', sqlerrm;
end $$;
