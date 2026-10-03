-- =============================================================================
-- Wiwaha OS · 0002 · Policy book + agent framework tables
-- The policy book is the single source of truth agents answer from (PRD §9).
-- =============================================================================

create table public.policies (
  key text primary key,                 -- e.g. 'pricing.phone'
  topic text not null,                  -- grouping shown in the editor
  title text not null,
  rule_text text not null,              -- the human-readable rule agents quote from
  value jsonb not null default '{}'::jsonb, -- structured parameters (validated by @wiwaha/policy)
  version integer not null default 1,
  owner_name text not null default 'Prashanth',
  client_visible boolean not null default false, -- portal chat may answer from it
  needs_confirmation boolean not null default false, -- open question in PRD §14
  sort integer not null default 100,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.policy_versions (
  id bigint generated always as identity primary key,
  policy_key text not null references public.policies(key) on delete cascade,
  version integer not null,
  rule_text text not null,
  value jsonb not null,
  changed_by uuid references public.profiles(id),
  change_note text,
  changed_at timestamptz not null default now(),
  unique (policy_key, version)
);

create or replace function app.version_policy() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'UPDATE' then
    if new.rule_text is not distinct from old.rule_text
       and new.value is not distinct from old.value then
      new.updated_at := now();
      return new;
    end if;
    new.version := old.version + 1;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

create or replace function app.record_policy_version() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.policy_versions (policy_key, version, rule_text, value, changed_by, change_note)
    values (new.key, new.version, new.rule_text, new.value, auth.uid(),
            nullif(current_setting('app.change_note', true), ''));
  end if;
  return null;
end $$;

create trigger policies_version before insert or update on public.policies
  for each row execute function app.version_policy();
create trigger policies_history after insert or update on public.policies
  for each row execute function app.record_policy_version();

alter table public.policies enable row level security;
create policy policies_read on public.policies for select
  using (app.is_staff() or (client_visible and auth.uid() is not null));
create policy policies_owner_write on public.policies for all
  using (app.is_owner()) with check (app.is_owner());

alter table public.policy_versions enable row level security;
create policy policy_versions_read on public.policy_versions for select using (app.is_staff());

select app.enable_audit('public.policies');

-- Convenience accessor for SQL functions (e.g. hold length, stage cards).
create or replace function app.policy_value(p_key text) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select value from public.policies where key = p_key
$$;

-- ---------------------------------------------------------------------------
-- Agents registry: autonomy dial, kill switch, model choice per agent.
-- ---------------------------------------------------------------------------
create type public.agent_autonomy as enum ('draft', 'act_and_notify', 'act_silently');
create type public.vertical as enum ('all', 'sales_marketing', 'event_crm', 'operations');

create table public.agents (
  key text primary key,                 -- 'chief_of_staff', 'lead_desk', ...
  name text not null,
  vertical public.vertical not null,
  job text not null,
  human_gate text not null,
  phase integer not null,
  implemented boolean not null default false,
  enabled boolean not null default true,  -- kill switch
  autonomy public.agent_autonomy not null default 'draft',
  model text not null,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger agents_touch before update on public.agents
  for each row execute function app.touch_updated_at();

alter table public.agents enable row level security;
create policy agents_read on public.agents for select using (app.is_staff());
create policy agents_owner_write on public.agents for update
  using (app.is_owner()) with check (app.is_owner());
select app.enable_audit('public.agents');

-- ---------------------------------------------------------------------------
-- Agent action log: every run, tool use, cost and approval.
-- ---------------------------------------------------------------------------
create type public.agent_action_status as enum
  ('ok', 'gated', 'blocked', 'escalated', 'error', 'fallback', 'skipped_disabled');

create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references public.agents(key),
  run_id uuid not null default gen_random_uuid(),
  action text not null,                 -- e.g. 'score_lead', 'draft_reply', 'morning_brief'
  status public.agent_action_status not null,
  lead_id uuid,
  wedding_id uuid,
  subject_table text,
  subject_id text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  tools_used text[] not null default '{}',
  policy_keys text[] not null default '{}',  -- which rules informed the output
  policy_versions jsonb not null default '{}'::jsonb,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd_micros bigint,
  duration_ms integer,
  approval_id uuid,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index agent_actions_agent_idx on public.agent_actions(agent_key, created_at desc);
create index agent_actions_lead_idx on public.agent_actions(lead_id) where lead_id is not null;
create index agent_actions_wedding_idx on public.agent_actions(wedding_id) where wedding_id is not null;
create index agent_actions_created_idx on public.agent_actions(created_at desc);

alter table public.agent_actions enable row level security;
create policy agent_actions_read on public.agent_actions for select
  using (app.has_role('owner', 'sales', 'event_manager', 'accounts'));
-- Writes: service role only (agents run server-side).

-- ---------------------------------------------------------------------------
-- Approval queue (one screen for Prashanth, PRD §9).
-- ---------------------------------------------------------------------------
create type public.approval_kind as enum (
  'lead_reply', 'client_message', 'discount', 'contract', 'quote', 'quote_line',
  'custom_decor', 'vendor_payment', 'ad_budget', 'purchase', 'brief', 'social_post',
  'review_reply', 'policy_answer', 'other'
);
create type public.approval_status as enum ('pending', 'approved', 'edited', 'rejected', 'expired');

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  kind public.approval_kind not null,
  title text not null,
  summary text,
  agent_key text references public.agents(key),
  agent_action_id uuid references public.agent_actions(id),
  lead_id uuid,
  wedding_id uuid,
  payload jsonb not null default '{}'::jsonb,        -- what the agent proposes
  edited_payload jsonb,                               -- what the human changed it to
  status public.approval_status not null default 'pending',
  priority smallint not null default 2 check (priority between 1 and 3), -- 1 = urgent
  guardrail_flags text[] not null default '{}',
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index approvals_pending_idx on public.approvals(status, priority, created_at) where status = 'pending';
create trigger approvals_touch before update on public.approvals
  for each row execute function app.touch_updated_at();

-- Who may decide which kind. Owner decides everything; sales may clear lead
-- replies; event managers may clear wedding briefs and client messages.
create or replace function app.can_decide(p_kind public.approval_kind) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_owner()
      or (p_kind in ('lead_reply') and app.has_role('sales'))
      or (p_kind in ('brief', 'client_message') and app.has_role('event_manager'))
$$;

alter table public.approvals enable row level security;
create policy approvals_read on public.approvals for select
  using (app.is_owner() or app.can_decide(kind));
create policy approvals_decide on public.approvals for update
  using (app.can_decide(kind)) with check (app.can_decide(kind));
select app.enable_audit('public.approvals');

-- ---------------------------------------------------------------------------
-- Inter-agent routing. Agents never call each other: they emit tasks that the
-- Chief of Staff routes (handoff §5).
-- ---------------------------------------------------------------------------
create type public.agent_task_status as enum ('queued', 'routed', 'in_progress', 'done', 'failed', 'held');

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  from_agent text references public.agents(key),
  to_agent text references public.agents(key),  -- set by Chief of Staff when routed
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  lead_id uuid,
  wedding_id uuid,
  status public.agent_task_status not null default 'queued',
  routed_by text references public.agents(key),
  routed_at timestamptz,
  due_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_tasks_status_idx on public.agent_tasks(status, created_at);
create trigger agent_tasks_touch before update on public.agent_tasks
  for each row execute function app.touch_updated_at();
alter table public.agent_tasks enable row level security;
create policy agent_tasks_read on public.agent_tasks for select
  using (app.has_role('owner', 'event_manager', 'sales'));

-- ---------------------------------------------------------------------------
-- Human queue: where work lands when an agent is switched off or escalates.
-- ---------------------------------------------------------------------------
create type public.human_queue_reason as enum ('agent_disabled', 'escalation', 'guardrail', 'error', 'off_policy');

create table public.human_queue (
  id uuid primary key default gen_random_uuid(),
  agent_key text references public.agents(key),
  reason public.human_queue_reason not null,
  title text not null,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  lead_id uuid,
  wedding_id uuid,
  assigned_role public.app_role,
  assigned_to uuid references public.profiles(id),
  status text not null default 'open' check (status in ('open', 'claimed', 'done')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index human_queue_open_idx on public.human_queue(status, created_at) where status <> 'done';
create trigger human_queue_touch before update on public.human_queue
  for each row execute function app.touch_updated_at();
alter table public.human_queue enable row level security;
create policy human_queue_read on public.human_queue for select
  using (app.is_owner() or (app.is_staff() and (assigned_to = auth.uid() or assigned_role = app.my_role() or assigned_role is null)));
create policy human_queue_update on public.human_queue for update
  using (app.is_owner() or (app.is_staff() and (assigned_to = auth.uid() or assigned_role = app.my_role() or assigned_role is null)))
  with check (app.is_staff());
select app.enable_audit('public.human_queue');

-- ---------------------------------------------------------------------------
-- Briefs: 8:30 am / 7 pm stand-ups and Prashanth's daily summary.
-- ---------------------------------------------------------------------------
create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('morning', 'evening')),
  for_date date not null,
  recipient_id uuid references public.profiles(id), -- null = owner summary
  title text not null,
  content_md text not null,
  data jsonb not null default '{}'::jsonb,
  agent_action_id uuid references public.agent_actions(id),
  created_at timestamptz not null default now()
);
create unique index briefs_one_per_day on public.briefs(kind, for_date, coalesce(recipient_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.briefs enable row level security;
create policy briefs_read on public.briefs for select
  using (app.is_owner() or recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- In-app notifications (hot-lead alerts etc.)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  role public.app_role,                 -- broadcast to a role when user_id is null
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select
  using (user_id = auth.uid() or (user_id is null and role = app.my_role()));
create policy notifications_mark_read on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
