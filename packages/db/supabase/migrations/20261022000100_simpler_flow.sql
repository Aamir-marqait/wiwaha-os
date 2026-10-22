-- The founders' second walkthrough (D44): how leads heard about Wiwaha, no
-- WhatsApp sending from the app, and phone logins for families.

-- ---------------------------------------------------------------------------
-- "How did you hear about Wiwaha?" The options are a list the team edits
-- (Settings → Lists); a lead keeps the words it was given.
-- ---------------------------------------------------------------------------
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (length(btrim(label)) between 2 and 60),
  sort integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger lead_sources_touch before update on public.lead_sources
  for each row execute function app.touch_updated_at();
alter table public.lead_sources enable row level security;
create policy lead_sources_read on public.lead_sources for select using (app.is_staff());
create policy lead_sources_write on public.lead_sources for all
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));
select app.enable_audit('public.lead_sources');

insert into public.lead_sources (label, sort) values
  ('Instagram', 10), ('Google search', 20), ('WedMeGood', 30), ('Our website', 40),
  ('Friend or family', 50), ('Been to an event here', 60), ('Wedding planner', 70), ('Other', 90)
on conflict (label) do nothing;

alter table public.leads add column heard_about text check (heard_about is null or length(heard_about) <= 80);

-- ---------------------------------------------------------------------------
-- Messaging: the team talks to families on WhatsApp from their own phones, so
-- Wiwaha OS neither drafts nor sends WhatsApp messages. Email stays.
-- ---------------------------------------------------------------------------
do $m$
begin
  perform set_config('app.change_note', 'WhatsApp is handled by the team on their own phones; the app drafts and sends no WhatsApp messages (D44).', true);
  insert into public.policies (key, topic, title, rule_text, value, client_visible, needs_confirmation, sort)
  values ('messaging.channels', 'Communication', 'Messaging channels',
          'The team talks to families on WhatsApp from their own phones. Wiwaha OS does not draft or send WhatsApp messages; it uses email and the couple''s portal.',
          '{"whatsapp":false,"email":true}'::jsonb,
          false, false, 15)
  on conflict (key) do nothing;
end $m$;

-- Drafts already waiting to go out on WhatsApp are withdrawn ('expired' sets no agent work off).
update public.messages set status = 'rejected'
 where channel = 'whatsapp' and direction = 'outbound' and status in ('pending_approval', 'approved');
update public.approvals a set status = 'expired', decided_at = now(), decision_note = 'WhatsApp is sent by the team from their own phones (D44)'
 where a.status = 'pending' and a.payload->>'channel' = 'whatsapp';

-- ---------------------------------------------------------------------------
-- Sales numbers count leads by how they heard about us (falling back to the
-- channel). The first-reply time measured drafted messages, which are gone.
-- ---------------------------------------------------------------------------
drop view public.sales_funnel;
create view public.sales_funnel with (security_invoker = true) as
select
  coalesce(l.heard_about, l.source::text) as source,
  count(*) as enquiries,
  count(*) filter (where exists (select 1 from public.visits v where v.lead_id = l.id)) as visits,
  count(*) filter (where l.status = 'won') as bookings
from public.leads l
group by coalesce(l.heard_about, l.source::text);
grant select on public.sales_funnel to authenticated;
