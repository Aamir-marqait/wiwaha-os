-- =============================================================================
-- Wiwaha OS · 0009 · Policy edits in one transaction (rule + change note)
-- Runs as the caller (SECURITY INVOKER), so RLS still limits edits to the owner.
-- =============================================================================
create or replace function public.update_policy(
  p_key text,
  p_rule_text text,
  p_value jsonb,
  p_note text default null,
  p_confirmed boolean default false
) returns public.policies
language plpgsql as $$
declare
  v_row public.policies;
begin
  perform set_config('app.change_note', coalesce(p_note, ''), true);
  update public.policies
     set rule_text = p_rule_text,
         value = p_value,
         needs_confirmation = case when p_confirmed then false else needs_confirmation end
   where key = p_key
   returning * into v_row;
  if v_row.key is null then
    raise exception 'Only the owner can edit the policy book' using errcode = '42501';
  end if;
  return v_row;
end $$;

revoke execute on function public.update_policy(text, text, jsonb, text, boolean) from public, anon;
grant execute on function public.update_policy(text, text, jsonb, text, boolean) to authenticated;
