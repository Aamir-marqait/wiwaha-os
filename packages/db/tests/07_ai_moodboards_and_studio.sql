-- Venue areas and the media library; the décor questionnaire only once décor
-- is open; AI moodboards stay hidden from the couple until shared; the
-- studio is for the marketing team only (D39–D41).
\set ON_ERROR_STOP 1

do $$
begin
  assert (select count(*) from public.venue_areas) >= 8, 'the estate''s areas are seeded';
  assert (select count(*) from public.policies where key in ('decor.ai_moodboards', 'studio.content')) = 2, 'both new policies seeded';
  assert (select profile ->> 'brand_name' from public.studio_brand) = 'WIWAHA by Praman', 'brand profile seeded';
  assert (select (value ->> 'contact_number') from public.policies where key = 'studio.content') = '+91 9169935666', 'the studio CTA number is policy, not code';
end $$;

-- A plain photo of the lawn and an event photo.
insert into public.media_assets (id, kind, path, url, venue_area_id, look, title)
select 'e1000000-0000-4000-8000-000000000001', 'image', 'test/lawn-plain.jpg', 'https://example.test/lawn-plain.jpg', id, 'plain', 'Lawn, wide' from public.venue_areas where name = 'Lawn';
insert into public.media_assets (id, kind, path, url, venue_area_id, look, title)
select 'e1000000-0000-4000-8000-000000000002', 'image', 'test/lawn-event.jpg', 'https://example.test/lawn-event.jpg', id, 'event', 'Lawn reception' from public.venue_areas where name = 'Lawn';
select public.set_primary_media('e1000000-0000-4000-8000-000000000001');

-- Folders: four deep at most; removing one keeps its photos.
do $$
declare a uuid; b uuid; c uuid; d uuid; v_ok boolean;
begin
  insert into public.media_folders (name) values ('T1') returning id into a;
  insert into public.media_folders (name, parent_id) values ('T2', a) returning id into b;
  insert into public.media_folders (name, parent_id) values ('T3', b) returning id into c;
  insert into public.media_folders (name, parent_id) values ('T4', c) returning id into d;
  begin
    insert into public.media_folders (name, parent_id) values ('T5', d);
    v_ok := true;
  exception when others then v_ok := sqlerrm not like 'Folders nest at most four deep%';
  end;
  assert not v_ok, 'a fifth level is refused';
  update public.media_assets set folder_id = d where id = 'e1000000-0000-4000-8000-000000000002';
  perform public.delete_media_folder(d);
  assert (select folder_id from public.media_assets where id = 'e1000000-0000-4000-8000-000000000002') = c, 'the photo moved up a level';
  update public.media_assets set folder_id = null where id = 'e1000000-0000-4000-8000-000000000002';
  delete from public.media_folders where id in (c, b, a);
end $$;

-- The couple: sees the plain area photos (for the questionnaire), not the rest of the library or the studio.
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.venue_areas) >= 8, 'families can read the areas';
  assert (select count(*) from public.media_assets) = 1, 'only the plain base photo';
  assert (select count(*) from public.studio_brand) = 0, 'no studio brand';
  assert (select count(*) from public.studio_items) = 0, 'no studio scripts';
  assert (select count(*) from public.media_jobs) = 0, 'no media jobs';
end $$;
-- Décor isn't open yet (it opens 90 days before), so the questionnaire can't be saved.
do $$
begin
  perform public.save_decor_brief('c0000000-0000-4000-8000-000000000001', '{"palette":["ivory","gold"]}'::jsonb, false);
  raise exception 'the questionnaire should wait for décor to open';
exception when others then
  if sqlerrm not like 'This part of your planning opens after%' then raise; end if;
end $$;
rollback;

-- Open décor (as if 90 days out with the advance paid) and fill in the questionnaire.
update public.wedding_stages set started_at = now(), status = 'in_progress'
 where wedding_id = 'c0000000-0000-4000-8000-000000000001' and key = 'decor';
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v public.decor_briefs;
begin
  v := public.save_decor_brief('c0000000-0000-4000-8000-000000000001', '{"palette":["ivory","gold"]}'::jsonb, false);
  assert v.status = 'open', 'saved as a draft';
  v := public.save_decor_brief('c0000000-0000-4000-8000-000000000001', '{"palette":["ivory","gold"],"style":"traditional"}'::jsonb, true);
  assert v.status = 'submitted' and v.submitted_by = '66666666-6666-4666-8666-666666666666', 'submitted by Ananya';
  begin
    perform public.save_decor_brief('c0000000-0000-4000-8000-000000000001', '{}'::jsonb, true);
    raise exception 'resubmitting should be refused';
  exception when others then
    if sqlerrm not like 'Your décor questionnaire is already with our team%' then raise; end if;
  end;
end $$;
commit;
do $$
begin
  assert exists (select 1 from public.agent_tasks where kind = 'decor_brief_submitted' and wedding_id = 'c0000000-0000-4000-8000-000000000001'), 'the Design assistant is asked for moodboards';
  delete from public.agent_tasks where kind = 'decor_brief_submitted';
end $$;

-- Sunita (a parent) can read the submitted questionnaire; once it is with the team, families can't change it.
begin;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.decor_briefs) = 1, 'family can read it';
  perform public.save_decor_brief('c0000000-0000-4000-8000-000000000001', '{}'::jsonb, false);
  raise exception 'changing a submitted questionnaire should be refused';
exception when others then
  if sqlerrm not like 'Your décor questionnaire is already with our team%' then raise; end if;
end $$;
rollback;

-- An AI moodboard with one slide, not yet shared.
do $$
declare v_fn uuid; v_mb uuid;
begin
  select id into v_fn from public.event_functions where wedding_id = 'c0000000-0000-4000-8000-000000000001' order by date limit 1;
  insert into public.moodboards (wedding_id, function_id, round, theme, design_kind, source, shared_at)
  values ('c0000000-0000-4000-8000-000000000001', v_fn, 1, 'Brass and jasmine', 'standard', 'ai', null) returning id into v_mb;
  insert into public.moodboard_slides (moodboard_id, wedding_id, function_id, area_name, element, status, result_url)
  values (v_mb, 'c0000000-0000-4000-8000-000000000001', v_fn, 'Lawn', 'Mandap', 'ready', 'https://example.test/mandap.png');
  perform set_config('test.mb', v_mb::text, false);
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.moodboards where id = current_setting('test.mb')::uuid), 'an unshared AI board is hidden from the couple';
  assert (select count(*) from public.moodboard_slides) = 0, 'and so are its slides';
  begin
    perform public.client_shortlist_moodboard(current_setting('test.mb')::uuid, true, null);
    raise exception 'shortlisting an unshared board should fail';
  exception when others then
    if sqlerrm <> 'Moodboard not found' then raise; end if;
  end;
end $$;
rollback;
-- Arjun (the wedding's event manager) sees it and shares it.
begin;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.moodboard_slides where moodboard_id = current_setting('test.mb')::uuid) = 1, 'the event manager sees the slides';
  update public.moodboards set shared_at = now() where id = current_setting('test.mb')::uuid;
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v public.moodboard_slides;
begin
  assert (select count(*) from public.moodboard_slides) = 1, 'shared: the couple sees the slide';
  v := public.client_note_moodboard_slide((select id from public.moodboard_slides limit 1), 'More marigold, less white please');
  assert v.client_note = 'More marigold, less white please', 'the note is saved';
  update public.moodboard_slides set result_url = 'https://evil.test/x.png';
  assert (select result_url from public.moodboard_slides limit 1) = 'https://example.test/mandap.png', 'the couple cannot change the slide itself';
end $$;
commit;
do $$
begin
  assert exists (select 1 from public.agent_tasks where kind = 'moodboard_feedback'), 'the Design assistant is asked to redo the slide';
  delete from public.agent_tasks where kind in ('moodboard_feedback', 'moodboard_shortlisted');
  delete from public.moodboards where id = current_setting('test.mb')::uuid;
  delete from public.decor_briefs where wedding_id = 'c0000000-0000-4000-8000-000000000001';
  update public.wedding_stages set started_at = null, status = 'not_started' where wedding_id = 'c0000000-0000-4000-8000-000000000001' and key = 'decor';
  delete from public.media_assets where id in ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002');
end $$;

-- The studio: Kavya (sales) works in it; Arjun (event manager) and Lakshmi (accounts) do not see it.
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  insert into public.studio_items (content_type, title, script, status) values ('carousel', 'Test', 'Slide 1 — Hook', 'draft');
  assert (select count(*) from public.studio_items) = 1, 'sales writes scripts';
  assert (select count(*) from public.studio_brand) = 1, 'sales reads the brand';
end $$;
rollback;
begin;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.studio_brand) = 0, 'event manager: no studio';
  assert (select count(*) from public.media_jobs) = 0, 'and no media jobs';
end $$;
rollback;
