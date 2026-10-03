-- PostgREST only exposes public: the Finance agent numbers invoices through
-- this wrapper. Service role only (agents run server-side).
create or replace function public.next_invoice_number(p_prefix text) returns text
language sql volatile set search_path = pg_catalog, public, app as $$ select app.next_invoice_number(p_prefix) $$;
revoke execute on function public.next_invoice_number(text) from public, anon, authenticated;
grant execute on function public.next_invoice_number(text) to service_role;
