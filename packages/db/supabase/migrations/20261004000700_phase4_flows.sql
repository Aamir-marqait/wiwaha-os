-- Phase 4 flows: editable run-of-show templates, more T-minus templates,
-- role-wide tasks visible to that role, idempotent scheduled jobs, and
-- social posts recorded in the outbox.

-- ---------------------------------------------------------------------------
-- Staff see unassigned tasks meant for their role (e.g. "staff" housekeeping).
-- ---------------------------------------------------------------------------
create policy tasks_read_role on public.tasks for select
  using (owner_id is null and owner_role is not null and owner_role = app.my_role());

-- ---------------------------------------------------------------------------
-- Scheduled-job idempotency (weekly reports, yearly wishes…): one row per run.
-- ---------------------------------------------------------------------------
create table public.job_runs (
  job text not null,
  run_key text not null,
  created_at timestamptz not null default now(),
  primary key (job, run_key)
);
alter table public.job_runs enable row level security;
create policy job_runs_read on public.job_runs for select using (app.is_owner());

-- ---------------------------------------------------------------------------
-- Social posts go through the outbox like every other channel.
-- ---------------------------------------------------------------------------
alter table public.outbox drop constraint if exists outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check
  check (kind in ('whatsapp', 'email', 'sms', 'instagram', 'call', 'payment_link', 'esign', 'web_chat', 'social_post'));

-- ---------------------------------------------------------------------------
-- Run-of-show templates per function type: minutes relative to the start.
-- Editable by the owner and event managers (the Planner reads them).
-- ---------------------------------------------------------------------------
create table public.run_of_show_templates (
  id uuid primary key default gen_random_uuid(),
  function_type public.function_type not null,
  offset_minutes integer not null,
  duration_minutes integer,
  title text not null,
  owner_label text,
  vendor_category text,
  sort integer not null default 100,
  active boolean not null default true
);
alter table public.run_of_show_templates enable row level security;
create policy rost_read on public.run_of_show_templates for select using (app.is_staff());
create policy rost_write on public.run_of_show_templates for all
  using (app.has_role('owner', 'event_manager')) with check (app.has_role('owner', 'event_manager'));
select app.enable_audit('public.run_of_show_templates');

insert into public.run_of_show_templates (function_type, offset_minutes, duration_minutes, title, owner_label, vendor_category, sort) values
  ('haldi',     -120, 90,  'Décor set-up and sound check',           'Décor team',      'decor',       10),
  ('haldi',      -30, 30,  'Photographer arrives; family seating',   'Event manager',   'photography', 20),
  ('haldi',        0, 90,  'Haldi ceremony',                         'Family',          null,          30),
  ('haldi',       90, 60,  'Brunch service',                         'Kitchen',         null,          40),
  ('mehendi',   -120, 90,  'Lounge set-up and mehendi stations',     'Décor team',      'decor',       10),
  ('mehendi',      0, 180, 'Mehendi and music',                      'Family',          'music',       20),
  ('mehendi',     60, 90,  'Snacks and high tea',                    'Kitchen',         null,          30),
  ('sangeet',   -180, 120, 'Stage, lights and sound check',          'AV team',         'music',       10),
  ('sangeet',    -30, 30,  'Hair and makeup final touches',          'Makeup artist',   'makeup',      20),
  ('sangeet',      0, 60,  'Guests arrive; welcome drinks',          'Event manager',   null,          30),
  ('sangeet',     60, 120, 'Performances and dance floor',           'Family',          'music',       40),
  ('sangeet',    120, 90,  'Dinner service',                         'Kitchen',         null,          50),
  ('wedding',   -240, 180, 'Mandap décor and floral finishing',      'Décor team',      'decor',       10),
  ('wedding',   -150, 120, 'Bride and groom getting ready',          'Makeup artist',   'makeup',      20),
  ('wedding',    -60, 60,  'Guests arrive; nadaswaram / welcome',    'Event manager',   'music',       30),
  ('wedding',      0, 120, 'Muhurtham and rituals',                  'Priest',          null,          40),
  ('wedding',    120, 120, 'Lunch service',                          'Kitchen',         null,          50),
  ('wedding',    -30, 30,  'Photographer and videographer in place', 'Photographer',    'photography', 25),
  ('reception', -180, 120, 'Stage and lighting set-up',              'Décor team',      'decor',       10),
  ('reception',    0, 60,  'Couple''s entry and welcome',            'Event manager',   'music',       20),
  ('reception',   30, 150, 'Greetings on stage; photos',             'Photographer',    'photography', 30),
  ('reception',   60, 150, 'Dinner service',                         'Kitchen',         null,          40),
  ('engagement',   0, 60,  'Ring ceremony',                          'Family',          null,          10),
  ('engagement',  60, 90,  'Lunch or dinner service',                'Kitchen',         null,          20),
  ('pooja',        0, 90,  'Pooja',                                  'Priest',          null,          10),
  ('pooja',       90, 60,  'Prasadam and meal',                      'Kitchen',         null,          20),
  ('cocktail',     0, 180, 'Cocktails and music',                    'Bar team',        'music',       10),
  ('other',        0, 120, 'Function',                               'Event manager',   null,          10);

-- More T-minus steps for the standard plan (added only if missing; editable).
insert into public.task_templates (plan_key, t_minus_days, title, default_role, priority, proof_kind, buffer_hours, sort)
select v.plan_key, v.t_minus_days, v.title, v.default_role::public.app_role, v.priority::public.task_priority, v.proof_kind::public.proof_kind, v.buffer_hours, v.sort
  from (values
    ('standard_wedding', 60, 'Brief reviewed; setup flags (fire, baraat, fireworks) actioned',  'event_manager', 'high',   'tick',  48, 35),
    ('standard_wedding', 30, 'Plate counts confirmed with the kitchen',                         'event_manager', 'high',   'tick',  24, 55),
    ('standard_wedding', 14, 'Housekeeping and check-in schedule published',                   'staff',         'normal', 'tick',  24, 75),
    ('standard_wedding', 14, 'Airport pickups and parking plan confirmed',                     'staff',         'normal', 'file',  24, 76),
    ('standard_wedding',  7, 'Inventory check: chairs, linen, crockery',                       'staff',         'high',   'photo', 12, 95),
    ('standard_wedding',  1, 'Security and valet briefing',                                    'staff',         'high',   'tick',   6, 105),
    ('standard_wedding',  0, 'Diesel and electricity readings at start of event',              'staff',         'normal', 'photo',  4, 115),
    ('standard_wedding', -1, 'Diesel and electricity readings at end of event',                'staff',         'normal', 'photo', 12, 125),
    ('standard_wedding', -1, 'Cost entries recorded for the wedding',                          'accounts',      'normal', 'tick',  24, 130)
  ) as v(plan_key, t_minus_days, title, default_role, priority, proof_kind, buffer_hours, sort)
 where not exists (select 1 from public.task_templates t where t.plan_key = v.plan_key and t.title = v.title);
