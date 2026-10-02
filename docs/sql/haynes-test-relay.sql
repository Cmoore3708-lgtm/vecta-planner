-- TEST ONLY. Service access is confined to these tables/functions.
create table public.haynes_relay_worker (
  id integer primary key check (id = 1), token_hash text,
  pair_hash text, pair_expires timestamptz, last_seen timestamptz,
  quota_day date, quota_count integer not null default 0
);
insert into public.haynes_relay_worker(id) values (1);
create table public.haynes_relay_jobs (
  id uuid primary key default gen_random_uuid(), registration text not null,
  status text not null default 'PENDING', vehicle jsonb,
  created_at timestamptz not null default now(), deadline timestamptz not null default (now() + interval '28 seconds'),
  completed_at timestamptz, lease uuid
);
create index haynes_relay_reg_created on public.haynes_relay_jobs(registration, created_at desc);
alter table public.haynes_relay_worker enable row level security;
alter table public.haynes_relay_jobs enable row level security;
revoke all on public.haynes_relay_worker, public.haynes_relay_jobs from public, anon, authenticated;
grant all on public.haynes_relay_worker, public.haynes_relay_jobs to service_role;

create function public.haynes_relay(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare w public.haynes_relay_worker; j public.haynes_relay_jobs; reg text; today date := (now() at time zone 'UTC')::date;
begin
  select * into w from public.haynes_relay_worker where id = 1 for update;
  if p_action = 'pair' then
    if w.pair_hash is null or w.pair_expires < now() or w.pair_hash <> p_payload->>'pair_hash'
      or coalesce(p_payload->>'token_hash','') !~ '^[a-f0-9]{64}$' then
      return jsonb_build_object('status','UNAUTHORIZED');
    end if;
    update public.haynes_relay_worker set token_hash = p_payload->>'token_hash', pair_hash = null, pair_expires = null, last_seen = null where id = 1;
    return jsonb_build_object('status','PAIRED');
  end if;
  if p_action in ('pull','complete') then
    if w.token_hash is null or w.token_hash <> coalesce(p_payload->>'token_hash','') then
      return jsonb_build_object('status','UNAUTHORIZED');
    end if;
    update public.haynes_relay_worker set last_seen = now() where id = 1;
  end if;
  -- Expired requests cannot be claimed or completed. Keep successful cache for 24h.
  delete from public.haynes_relay_jobs where created_at < now() - interval '24 hours';
  update public.haynes_relay_jobs set status = 'UNAVAILABLE' where status in ('PENDING','WORKING') and deadline < now();
  if p_action = 'enqueue' then
    reg := p_payload->>'registration';
    if coalesce(reg,'') !~ '^[A-Z0-9]{2,8}$' then return jsonb_build_object('status','INVALID_REGISTRATION'); end if;
    select * into j from public.haynes_relay_jobs where registration = reg and status = 'MATCHED'
      and completed_at > now() - interval '24 hours' order by created_at desc limit 1;
    if found then return jsonb_build_object('status','MATCHED','vehicle',j.vehicle); end if;
    if w.token_hash is null then return jsonb_build_object('status','NOT_PAIRED'); end if;
    if w.last_seen is null or w.last_seen < now() - interval '45 seconds' then return jsonb_build_object('status','OFFLINE'); end if;
    select * into j from public.haynes_relay_jobs where registration = reg and status in ('PENDING','WORKING') limit 1;
    if found then return jsonb_build_object('status','PENDING','id',j.id); end if;
    if (select count(*) from public.haynes_relay_jobs where status in ('PENDING','WORKING')) >= 3 then return jsonb_build_object('status','BUSY'); end if;
    if w.quota_day = today and w.quota_count >= 150 then return jsonb_build_object('status','DAILY_LIMIT'); end if;
    update public.haynes_relay_worker set quota_day = today, quota_count = case when quota_day = today then quota_count + 1 else 1 end where id = 1;
    insert into public.haynes_relay_jobs(registration) values (reg) returning * into j;
    return jsonb_build_object('status','PENDING','id',j.id);
  elsif p_action = 'poll' then
    select * into j from public.haynes_relay_jobs where id = (p_payload->>'id')::uuid;
    if not found then return jsonb_build_object('status','UNAVAILABLE'); end if;
    return jsonb_build_object('status',case when j.status = 'WORKING' then 'PENDING' else j.status end,'vehicle',j.vehicle);
  elsif p_action = 'pull' then
    if exists(select 1 from public.haynes_relay_jobs where status = 'WORKING') then return jsonb_build_object('status','IDLE'); end if;
    select * into j from public.haynes_relay_jobs where status = 'PENDING' order by created_at limit 1;
    if not found then return jsonb_build_object('status','IDLE'); end if;
    update public.haynes_relay_jobs set status = 'WORKING', lease = gen_random_uuid() where id = j.id returning * into j;
    return jsonb_build_object('status','JOB','id',j.id,'registration',j.registration,'lease',j.lease);
  elsif p_action = 'complete' then
    if coalesce(p_payload->>'status','') not in ('MATCHED','LOGIN_REQUIRED','VERIFICATION_REQUIRED','AMBIGUOUS','BUSY','DAILY_LIMIT','UNAVAILABLE') then return jsonb_build_object('status','INVALID_RESULT'); end if;
    update public.haynes_relay_jobs set status = p_payload->>'status',
      vehicle = case when p_payload->>'status' = 'MATCHED' then p_payload->'vehicle' else null end, completed_at = now()
      where id = (p_payload->>'id')::uuid and lease = (p_payload->>'lease')::uuid and status = 'WORKING' and deadline >= now()
        and (p_payload->>'status' <> 'MATCHED' or p_payload->'vehicle'->>'registration' = registration);
    return jsonb_build_object('status',case when found then 'SAVED' else 'EXPIRED' end);
  end if;
  return jsonb_build_object('status','INVALID_ACTION');
end $$;
revoke all on function public.haynes_relay(text,jsonb) from public, anon, authenticated;
grant execute on function public.haynes_relay(text,jsonb) to service_role;
