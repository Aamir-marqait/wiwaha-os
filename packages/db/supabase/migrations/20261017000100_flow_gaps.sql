-- Gaps found walking the business flow end to end with the founders (D42):
-- what décor costs per event (our stock, plus what we rent or buy for it),
-- vendor specialities, and what the AI pictures and reels cost.

-- ---------------------------------------------------------------------------
-- Décor stock: what a piece cost us, and what using it once costs an event
-- (wear, cleaning, transport). Both optional; shown only to staff.
-- ---------------------------------------------------------------------------
alter table public.decor_items
  add column unit_cost_paise bigint check (unit_cost_paise is null or unit_cost_paise >= 0),
  add column use_cost_paise bigint check (use_cost_paise is null or use_cost_paise >= 0);

-- ---------------------------------------------------------------------------
-- Extras for one event: pieces we rent (noted, returned) or buy (they join
-- our stock and are assigned to the event). Either way the cost lands in the
-- wedding's costing (cost_entries, category décor).
-- ---------------------------------------------------------------------------
create table public.event_decor_extras (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid references public.event_functions(id) on delete set null,
  area text,
  name text not null check (length(trim(name)) between 2 and 120),
  kind text not null check (kind in ('rented', 'purchased')),
  supplier text,
  vendor_id uuid references public.vendors(id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  unit_cost_paise bigint not null default 0 check (unit_cost_paise >= 0),
  total_paise bigint generated always as (quantity * unit_cost_paise) stored,
  status text not null default 'planned' check (status in ('planned', 'received', 'returned', 'cancelled')),
  return_by date,                                   -- rented: when it goes back
  decor_item_id uuid references public.decor_items(id) on delete set null,  -- purchased: the stock piece it became (or topped up)
  cost_entry_id uuid references public.cost_entries(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_decor_extras_wedding_idx on public.event_decor_extras(wedding_id);
create trigger event_decor_extras_touch before update on public.event_decor_extras
  for each row execute function app.touch_updated_at();
alter table public.event_decor_extras enable row level security;
create policy event_decor_extras_read on public.event_decor_extras for select using (app.is_staff());
create policy event_decor_extras_write on public.event_decor_extras for all
  using (app.has_role('owner', 'event_manager', 'staff', 'accounts')) with check (app.has_role('owner', 'event_manager', 'staff', 'accounts'));
select app.enable_audit('public.event_decor_extras');

-- Purchases join the stock once; the cost follows the row (and goes when it's cancelled).
create or replace function app.on_decor_extra() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, app as $$
declare v_item uuid; v_cost uuid; v_area text;
begin
  if new.kind = 'purchased' and new.status in ('received', 'returned') and (tg_op = 'INSERT' or old.status = 'planned' or old.kind <> 'purchased') then
    v_area := coalesce(nullif(trim(new.area), ''), 'Other');
    if new.decor_item_id is not null then
      update public.decor_items set quantity = quantity + new.quantity where id = new.decor_item_id;
      v_item := new.decor_item_id;
    else
      insert into public.decor_items (name, category, quantity, unit_cost_paise, notes, created_by)
      values (new.name, 'other', new.quantity, nullif(new.unit_cost_paise, 0), 'Bought for an event', new.created_by)
      returning id into v_item;
      update public.event_decor_extras set decor_item_id = v_item where id = new.id;
    end if;
    insert into public.decor_assignments (decor_item_id, wedding_id, function_id, area, quantity, notes, assigned_by)
    values (v_item, new.wedding_id, new.function_id, v_area, new.quantity, 'Bought for this event', new.created_by);
  end if;

  if new.status = 'cancelled' or new.total_paise = 0 then
    if new.cost_entry_id is not null then
      delete from public.cost_entries where id = new.cost_entry_id;
      update public.event_decor_extras set cost_entry_id = null where id = new.id;
    end if;
  elsif new.cost_entry_id is null then
    insert into public.cost_entries (wedding_id, category, amount_paise, description, entered_by)
    values (new.wedding_id, 'decor', new.total_paise, (case new.kind when 'rented' then 'Rented: ' else 'Bought: ' end) || new.name || (case when new.quantity > 1 then ' × ' || new.quantity else '' end), new.created_by)
    returning id into v_cost;
    update public.event_decor_extras set cost_entry_id = v_cost where id = new.id;
  else
    update public.cost_entries
       set amount_paise = new.total_paise,
           description = (case new.kind when 'rented' then 'Rented: ' else 'Bought: ' end) || new.name || (case when new.quantity > 1 then ' × ' || new.quantity else '' end)
     where id = new.cost_entry_id;
  end if;
  return null;
end $$;
create trigger event_decor_extras_after after insert or update of status, kind, quantity, unit_cost_paise, name on public.event_decor_extras
  for each row execute function app.on_decor_extra();

-- ---------------------------------------------------------------------------
-- Vendors: what they're best at and where they work, to group and find them.
-- ---------------------------------------------------------------------------
alter table public.vendors
  add column specialities text[] not null default '{}',
  add column service_area text;

-- ---------------------------------------------------------------------------
-- AI spend: each fal job records what it should cost (from the prices kept
-- with the models in agents.config.media_prices) and which wedding or post it
-- was for. Moodboard pictures go into the wedding's costing, studio work into
-- marketing (cost_entries).
-- ---------------------------------------------------------------------------
alter table public.media_jobs
  add column cost_usd numeric(10, 4),
  add column wedding_id uuid references public.weddings(id) on delete set null,
  add column item_id uuid references public.studio_items(id) on delete set null,
  add column cost_entry_id uuid references public.cost_entries(id) on delete set null;
create index media_jobs_month_idx on public.media_jobs(created_at) where cost_usd is not null;
-- Accounts plan the spend too.
drop policy media_jobs_read on public.media_jobs;
create policy media_jobs_read on public.media_jobs for select using (app.has_role('owner', 'accounts'));

do $m$
begin
  perform set_config('app.change_note', 'AI picture and video spend: monthly budget and the exchange rate used for costing (D42).', true);
  insert into public.policies (key, topic, title, rule_text, value, client_visible, needs_confirmation, sort)
  values ('media.budget', 'Marketing', 'AI credits budget',
          'AI pictures, voiceovers, music and clips are paid from the fal account. The monthly budget is USD 50; the dashboard warns when 80% is used. Costs are converted at ₹88 to the dollar for the wedding costing and marketing spend.',
          '{"monthly_usd":50,"warn_at_pct":80,"inr_per_usd":88}'::jsonb,
          false, true, 143)
  on conflict (key) do nothing;
end $m$;

-- Prices per fal endpoint (USD, from fal's model pages, 2026-10-17), and a
-- cheaper model for the studio's non-venue detail pictures: venue photos are
-- always real, so the Pro model is kept for moodboards, where it matters.
update public.agents
   set config = jsonb_set(config, '{media_models,image}', '"fal-ai/nano-banana"'::jsonb, true)
 where key = 'content_studio';
update public.agents
   set config = config || jsonb_build_object('media_prices', '{
     "fal-ai/nano-banana-pro": {"per": "image", "usd": 0.15},
     "fal-ai/nano-banana-pro/edit": {"per": "image", "usd": 0.15},
     "fal-ai/nano-banana": {"per": "image", "usd": 0.039},
     "fal-ai/nano-banana/edit": {"per": "image", "usd": 0.039},
     "fal-ai/bytedance/seedream/v4/edit": {"per": "image", "usd": 0.03},
     "fal-ai/elevenlabs/tts/eleven-v3": {"per": "1k_chars", "usd": 0.10},
     "fal-ai/elevenlabs/music": {"per": "audio_minute", "usd": 0.60},
     "minimax/h3-max/image-to-video": {"per": "second", "usd": 0.08},
     "fal-ai/kling-video/v2.5-turbo/pro/image-to-video": {"per": "second", "usd": 0.07}
   }'::jsonb)
 where key in ('content_studio', 'design');
