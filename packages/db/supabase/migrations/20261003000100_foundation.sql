-- =============================================================================
-- Wiwaha OS · 0001 · Foundation
-- Extensions, enums, profiles, role helpers, updated_at + audit triggers.
-- Conventions: money = bigint paise, timestamps = timestamptz (UTC),
-- calendar days = date. Every table gets RLS in the migration that creates it.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'owner', 'sales', 'event_manager', 'staff', 'accounts', 'client', 'vendor', 'agent'
);
create type public.language_code as enum ('en', 'kn', 'hi', 'ta', 'te');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user. Role is assigned server-side only
-- (staff invite, wedding membership, or app_metadata), never by the user.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext,
  full_name text not null default '',
  phone_e164 text,
  role public.app_role not null default 'client',
  active boolean not null default true,
  preferred_language public.language_code not null default 'en',
  title text,                              -- e.g. "Founder", "Sales Executive"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role) where active;
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they can read profiles under RLS)
-- ---------------------------------------------------------------------------
-- True for the service-role key (server, agents, cron) and for direct database
-- sessions with no JWT (migrations, pg_cron). Uses session_user, not
-- current_user, so it stays false inside SECURITY DEFINER functions called by
-- ordinary users.
create or replace function app.is_service() returns boolean
language sql stable as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is not null
      then (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
    else session_user in ('postgres', 'supabase_admin')
  end
$$;

create or replace function app.my_role() returns public.app_role
language sql stable security definer set search_path = public, app as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function app.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(app.my_role() = any(roles), false)
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.has_role('owner', 'sales', 'event_manager', 'staff', 'accounts')
$$;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.has_role('owner')
$$;

-- Prevent anyone except the owner (or the service role) from changing roles.
create or replace function app.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not (app.is_owner() or app.is_service()) then
    raise exception 'Only the owner can change roles or deactivate users'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function app.guard_profile_role();

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or app.is_staff());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid() or app.is_owner())
  with check (id = auth.uid() or app.is_owner());
-- inserts happen via the auth.users trigger (security definer) or service role.

-- ---------------------------------------------------------------------------
-- Audit log: every human edit with user, time and IP (handoff §3 "Audit").
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  actor_role text,                    -- app_role of the user, or 'service_role'
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[],
  old_data jsonb,
  new_data jsonb,
  ip text,
  forwarded_for text,
  user_agent text,
  via text                              -- 'portal' | 'team' | 'agent' | 'system'
);
create index audit_log_record_idx on public.audit_log(table_name, record_id);
create index audit_log_user_idx on public.audit_log(user_id, at desc);
create index audit_log_at_idx on public.audit_log(at desc);

alter table public.audit_log enable row level security;
create policy audit_log_owner_read on public.audit_log for select using (app.is_owner());
-- No insert/update/delete policies: only the trigger (security definer) writes.

create or replace function app.request_headers() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb)
$$;

-- Client IP. Our Next.js server forwards the browser IP as x-client-ip; direct
-- browser→PostgREST calls carry it in x-forwarded-for (first hop).
create or replace function app.client_ip() returns text
language sql stable as $$
  select nullif(trim(coalesce(
    app.request_headers() ->> 'x-client-ip',
    split_part(app.request_headers() ->> 'x-forwarded-for', ',', 1),
    app.request_headers() ->> 'x-real-ip',
    current_setting('app.client_ip', true)
  )), '')
$$;

create or replace function app.audit_trigger() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_id text;
  v_role text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k);
    if v_changed is null then
      return new; -- nothing meaningful changed
    end if;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key');
  v_role := case
    when auth.uid() is not null then coalesce(app.my_role()::text, 'unknown')
    when app.is_service() then 'service_role'
    else 'anon'
  end;

  insert into public.audit_log
    (user_id, actor_role, table_name, record_id, action, changed_fields,
     old_data, new_data, ip, forwarded_for, user_agent, via)
  values
    (auth.uid(), v_role, tg_table_name, v_id, tg_op, v_changed,
     v_old, v_new, app.client_ip(),
     app.request_headers() ->> 'x-forwarded-for',
     app.request_headers() ->> 'user-agent',
     coalesce(app.request_headers() ->> 'x-wiwaha-surface', current_setting('app.surface', true)));

  return coalesce(new, old);
end $$;

create or replace function app.enable_audit(p_table regclass) returns void
language plpgsql as $$
begin
  execute format(
    'create trigger audit_row after insert or update or delete on %s
       for each row execute function app.audit_trigger()', p_table);
end $$;

select app.enable_audit('public.profiles');

-- ---------------------------------------------------------------------------
-- Staff invites. The owner invites by email + role; when that email signs up
-- (Supabase invite link), handle_new_user() assigns the role.
-- ---------------------------------------------------------------------------
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  full_name text not null default '',
  role public.app_role not null check (role in ('owner', 'sales', 'event_manager', 'staff', 'accounts', 'vendor')),
  title text,
  invited_by uuid references public.profiles(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
create unique index staff_invites_open_email on public.staff_invites(email)
  where accepted_at is null and revoked_at is null;

alter table public.staff_invites enable row level security;
create policy staff_invites_owner on public.staff_invites for all
  using (app.is_owner()) with check (app.is_owner());
select app.enable_audit('public.staff_invites');
