-- =============================================================================
-- Wiwaha OS · 0006 · Operations: tasks, rooms & guests, estate, costs, files
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tasks (wedding T-minus plans, estate maintenance, sales follow-ups)
-- ---------------------------------------------------------------------------
create type public.task_scope as enum ('wedding', 'estate', 'sales', 'admin');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.proof_kind as enum ('none', 'tick', 'photo', 'file');

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null default 'standard_wedding',
  scope public.task_scope not null default 'wedding',
  t_minus_days integer,                       -- 90, 60, 30, 14, 7, 1, 0 (event day), -1 (T+1)
  title text not null,
  description text,
  default_role public.app_role,
  priority public.task_priority not null default 'normal',
  proof_kind public.proof_kind not null default 'tick',
  buffer_hours integer not null default 24,
  sort integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  scope public.task_scope not null,
  wedding_id uuid references public.weddings(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  function_id uuid references public.event_functions(id) on delete set null,
  template_id uuid references public.task_templates(id) on delete set null,
  maintenance_id uuid,                        -- FK added below
  title text not null,
  description text,
  owner_id uuid references public.profiles(id),
  owner_role public.app_role,
  due_at timestamptz,
  t_minus_days integer,
  buffer_hours integer not null default 24,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'todo',
  proof_kind public.proof_kind not null default 'tick',
  proof_path text,
  proof_note text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  escalated_at timestamptz,
  created_by uuid references public.profiles(id),
  created_by_agent text references public.agents(key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope <> 'wedding' or wedding_id is not null)
);
create index tasks_owner_idx on public.tasks(owner_id, status, due_at);
create index tasks_wedding_idx on public.tasks(wedding_id, due_at);
create index tasks_due_idx on public.tasks(due_at) where status in ('todo', 'in_progress', 'blocked');
create trigger tasks_touch before update on public.tasks
  for each row execute function app.touch_updated_at();

alter table public.task_templates enable row level security;
create policy task_templates_read on public.task_templates for select using (app.is_staff());
create policy task_templates_write on public.task_templates for all
  using (app.has_role('owner', 'event_manager')) with check (app.has_role('owner', 'event_manager'));

alter table public.tasks enable row level security;
-- Estate & housekeeping staff: their task list only.
create policy tasks_read on public.tasks for select
  using (app.is_owner()
         or owner_id = auth.uid()
         or (wedding_id is not null and app.staff_can_see_wedding(wedding_id))
         or (scope = 'sales' and app.has_role('sales'))
         or (scope = 'estate' and app.has_role('event_manager')));
create policy tasks_insert on public.tasks for insert
  with check (app.has_role('owner', 'event_manager', 'sales'));
create policy tasks_update on public.tasks for update
  using (app.is_owner() or owner_id = auth.uid()
         or (wedding_id is not null and app.staff_can_edit_wedding(wedding_id)))
  with check (app.is_owner() or owner_id = auth.uid()
         or (wedding_id is not null and app.staff_can_edit_wedding(wedding_id)));
select app.enable_audit('public.tasks');

-- ---------------------------------------------------------------------------
-- Rooms & guests
-- ---------------------------------------------------------------------------
create table public.room_allocations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  room_id uuid references public.rooms(id),
  guest_name text not null,
  guest_phone_e164 text,
  party_size integer not null default 1,
  check_in date not null,
  check_out date not null,
  complimentary boolean not null default false,
  needs_pickup boolean not null default false,
  pickup_at timestamptz,
  pickup_from text,                            -- 'BLR T1', 'BLR T2', ...
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'checked_in', 'checked_out', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);
create trigger room_allocations_touch before update on public.room_allocations
  for each row execute function app.touch_updated_at();
alter table public.room_allocations enable row level security;
create policy room_allocations_read on public.room_allocations for select
  using (app.can_see_wedding(wedding_id) or app.has_role('staff'));
create policy room_allocations_write on public.room_allocations for all
  using (app.staff_can_edit_wedding(wedding_id) or app.has_role('staff') or app.member_can(wedding_id, 'edit_brief'))
  with check (app.staff_can_edit_wedding(wedding_id) or app.has_role('staff') or app.member_can(wedding_id, 'edit_brief'));
select app.enable_audit('public.room_allocations');

-- ---------------------------------------------------------------------------
-- Estate: inventory, maintenance, utility readings
-- ---------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,                      -- 'furniture', 'linen', 'crockery', 'consumables', ...
  quantity integer not null default 0 check (quantity >= 0),
  unit text not null default 'pcs',
  location text,
  reorder_level integer not null default 0,
  unit_cost_paise bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger inventory_items_touch before update on public.inventory_items
  for each row execute function app.touch_updated_at();

create table public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,                      -- 'garden', 'pool', 'ac', 'generator', 'pest_control', ...
  frequency_days integer not null check (frequency_days > 0),
  last_done_on date,
  next_due_on date,
  owner_id uuid references public.profiles(id),
  vendor_id uuid references public.vendors(id),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger maintenance_schedules_touch before update on public.maintenance_schedules
  for each row execute function app.touch_updated_at();
alter table public.tasks add constraint tasks_maintenance_fk
  foreign key (maintenance_id) references public.maintenance_schedules(id) on delete set null;

create table public.utility_readings (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid references public.weddings(id) on delete set null,
  kind text not null check (kind in ('diesel_litres', 'electricity_kwh', 'water_kl', 'lpg_kg')),
  reading numeric(12, 2) not null,
  is_meter_reading boolean not null default true,  -- false = consumption amount
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id),
  photo_path text,
  notes text
);

alter table public.inventory_items enable row level security;
alter table public.maintenance_schedules enable row level security;
alter table public.utility_readings enable row level security;
create policy inventory_read on public.inventory_items for select
  using (app.has_role('owner', 'staff', 'event_manager', 'accounts'));
create policy inventory_write on public.inventory_items for all
  using (app.has_role('owner', 'staff')) with check (app.has_role('owner', 'staff'));
create policy maintenance_read on public.maintenance_schedules for select
  using (app.has_role('owner', 'staff', 'event_manager'));
create policy maintenance_write on public.maintenance_schedules for all
  using (app.has_role('owner', 'staff')) with check (app.has_role('owner', 'staff'));
create policy utility_read on public.utility_readings for select
  using (app.has_role('owner', 'staff', 'accounts', 'event_manager'));
create policy utility_write on public.utility_readings for insert
  with check (app.has_role('owner', 'staff'));
select app.enable_audit('public.inventory_items');
select app.enable_audit('public.maintenance_schedules');
select app.enable_audit('public.utility_readings');

-- ---------------------------------------------------------------------------
-- Cost entries (per-wedding profit; owner + accounts only — margins are private)
-- ---------------------------------------------------------------------------
create table public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid references public.weddings(id) on delete cascade,
  category text not null check (category in ('staff', 'utilities', 'diesel', 'fnb', 'decor', 'vendor', 'consumables', 'breakage', 'marketing', 'other')),
  amount_paise bigint not null,
  description text,
  incurred_on date not null default current_date,
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.cost_entries enable row level security;
create policy cost_entries_rw on public.cost_entries for all
  using (app.has_role('owner', 'accounts')) with check (app.has_role('owner', 'accounts'));
select app.enable_audit('public.cost_entries');

-- ---------------------------------------------------------------------------
-- Files (Supabase Storage objects referenced from the Wedding Room)
-- ---------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'wedding-files',
  path text not null,
  wedding_id uuid references public.weddings(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  kind text not null default 'document',      -- 'document', 'photo', 'proof', 'contract', 'receipt', 'voice_note', 'recording'
  label text,
  mime_type text,
  size_bytes bigint,
  client_visible boolean not null default false,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
alter table public.files enable row level security;
create policy files_read on public.files for select
  using (app.is_owner()
         or (wedding_id is not null and app.staff_can_see_wedding(wedding_id))
         or (wedding_id is not null and client_visible and app.is_wedding_member(wedding_id))
         or (lead_id is not null and app.has_role('sales'))
         or uploaded_by = auth.uid());
create policy files_insert on public.files for insert
  with check (auth.uid() is not null and uploaded_by = auth.uid()
              and (app.is_staff() or (wedding_id is not null and app.is_wedding_member(wedding_id) and client_visible)));
select app.enable_audit('public.files');
