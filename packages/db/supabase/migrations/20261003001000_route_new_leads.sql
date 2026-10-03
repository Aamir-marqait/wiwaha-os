-- =============================================================================
-- Wiwaha OS · 0010 · Every enquiry is routed by the Chief of Staff
-- ingest_lead now leaves an agent_task ('new_lead' or 'lead_updated'); the
-- Chief of Staff routes it to Lead Desk. A lead can't be missed if a web
-- request dies halfway: the hourly routing run picks it up.
-- =============================================================================
create or replace function app.queue_lead_task() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.status in ('won', 'lost', 'no_response') then
    return new; -- closed leads need no reply
  end if;
  if tg_op = 'INSERT' then
    insert into public.agent_tasks (kind, lead_id, payload) values ('new_lead', new.id, jsonb_build_object('source', new.source));
  elsif new.touch_count > old.touch_count then
    -- A family wrote again: rescore and draft a fresh reply, unless one is already queued.
    insert into public.agent_tasks (kind, lead_id, payload)
    select 'lead_updated', new.id, jsonb_build_object('touch_count', new.touch_count)
     where not exists (select 1 from public.agent_tasks t where t.lead_id = new.id and t.status = 'queued' and t.kind in ('new_lead', 'lead_updated'));
  end if;
  return new;
end $$;

create trigger leads_queue_agent_task after insert or update of touch_count on public.leads
  for each row execute function app.queue_lead_task();

-- Leads that exist already (e.g. the seed) and were never processed.
insert into public.agent_tasks (kind, lead_id, payload)
select 'new_lead', l.id, jsonb_build_object('source', l.source, 'backfill', true)
  from public.leads l
 where l.score is null and l.status not in ('won', 'lost', 'no_response')
   and not exists (select 1 from public.agent_tasks t where t.lead_id = l.id);
