-- =============================================================================
-- Wiwaha OS · MCP connector: OAuth 2.1 clients, codes and tokens (D38)
-- Claude connects to /api/mcp. A person signs in with their own Wiwaha login
-- and approves the connection; every tool call then runs as that person, under
-- the same row-level security and audit as the app. Only the server (service
-- role) touches these tables; tokens are stored as SHA-256 hashes.
-- =============================================================================

create table public.mcp_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at timestamptz not null default now()
);
alter table public.mcp_clients enable row level security;

create table public.mcp_codes (
  code_hash text primary key,
  client_id text not null references public.mcp_clients(client_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text,
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.mcp_codes enable row level security;

create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  kind text not null check (kind in ('access', 'refresh')),
  client_id text not null references public.mcp_clients(client_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_tokens_user_idx on public.mcp_tokens(user_id) where revoked_at is null;
alter table public.mcp_tokens enable row level security;
-- People can see (and the app lets them revoke, via the server) their own connections.
create policy mcp_tokens_read_own on public.mcp_tokens for select using (user_id = auth.uid() or app.is_owner());
select app.enable_audit('public.mcp_tokens');
