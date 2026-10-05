-- TEST ONLY: scoped website credential; no workshop table access.
alter table public.haynes_relay_worker add column site_token_hash text;
create function public.haynes_relay_site(p_action text,p_payload jsonb,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare expected text;
begin
  select site_token_hash into expected from public.haynes_relay_worker where id=1;
  if expected is null or expected <> coalesce(p_token_hash,'') or p_action not in ('enqueue','poll') then
    return jsonb_build_object('status','UNAUTHORIZED');
  end if;
  return public.haynes_relay(p_action,p_payload);
end $$;
revoke all on function public.haynes_relay_site(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.haynes_relay_site(text,jsonb,text) to service_role;
