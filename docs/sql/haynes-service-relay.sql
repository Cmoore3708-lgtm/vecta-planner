-- Test project brqsejjykrubxuofavuu only. Separate queue preserves old vehicle workers.
begin;
alter table public.haynes_relay_worker add column service_last_seen timestamptz;
create table public.haynes_service_jobs (
 id uuid primary key default gen_random_uuid(), request jsonb not null,
 status text not null default 'PENDING', result jsonb, lease uuid,
 created_at timestamptz not null default now(), deadline timestamptz not null default now()+interval '90 seconds'
);
alter table public.haynes_service_jobs enable row level security;
revoke all on public.haynes_service_jobs from public,anon,authenticated;
grant all on public.haynes_service_jobs to service_role;
create function public.haynes_service_relay(p_action text,p_payload jsonb,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.haynes_relay_worker; j public.haynes_service_jobs;
begin
 select * into w from public.haynes_relay_worker where id=1 for update;
 if p_action in ('enqueue','poll') then
  if w.site_token_hash is null or w.site_token_hash<>coalesce(p_token_hash,'') then return jsonb_build_object('status','UNAUTHORIZED'); end if;
 elsif p_action in ('pull','complete') then
  if w.token_hash is null or w.token_hash<>coalesce(p_token_hash,'') then return jsonb_build_object('status','UNAUTHORIZED'); end if;
 else return jsonb_build_object('status','INVALID_ACTION'); end if;
 update public.haynes_service_jobs set status='UNAVAILABLE' where status in ('PENDING','WORKING') and deadline<now();
 if p_action='enqueue' then
  if coalesce(p_payload->>'registration','') !~ '^[A-Z0-9]{2,8}$' or coalesce(p_payload->>'mileage','') !~ '^[0-9]{1,7}$' or (p_payload->>'mileage')::int not between 1 and 2000000 then return jsonb_build_object('status','INVALID_REQUEST'); end if;
  select * into j from public.haynes_service_jobs where request=p_payload and status='MATCHED' and created_at>now()-interval '2 hours' order by created_at desc limit 1;
  if found then return jsonb_build_object('status','MATCHED','result',j.result); end if;
  if w.service_last_seen is null or w.service_last_seen<now()-interval '90 seconds' then return jsonb_build_object('status','WORKER_UPDATE_REQUIRED'); end if;
  if w.last_seen is null or w.last_seen<now()-interval '45 seconds' then return jsonb_build_object('status','OFFLINE'); end if;
  select * into j from public.haynes_service_jobs where request=p_payload and status in ('PENDING','WORKING') limit 1;
  if found then return jsonb_build_object('status','PENDING','id',j.id); end if;
  if (select count(*) from public.haynes_service_jobs where status in ('PENDING','WORKING'))>=2 then return jsonb_build_object('status','BUSY'); end if;
  if (select count(*) from public.haynes_service_jobs where created_at>now()-interval '24 hours')>=50 then return jsonb_build_object('status','DAILY_LIMIT'); end if;
  insert into public.haynes_service_jobs(request) values(p_payload) returning * into j;
  return jsonb_build_object('status','PENDING','id',j.id);
 elsif p_action='poll' then
  select * into j from public.haynes_service_jobs where id=(p_payload->>'id')::uuid;
  if not found then return jsonb_build_object('status','UNAVAILABLE'); end if;
  return jsonb_build_object('status',case when j.status='WORKING' then 'PENDING' else j.status end,'result',j.result,'request',j.request);
 elsif p_action='pull' then
  update public.haynes_relay_worker set service_last_seen=now() where id=1;
  if exists(select 1 from public.haynes_service_jobs where status='WORKING') then return jsonb_build_object('status','IDLE'); end if;
  select * into j from public.haynes_service_jobs where status='PENDING' order by created_at limit 1;
  if not found then return jsonb_build_object('status','IDLE'); end if;
  update public.haynes_service_jobs set status='WORKING',lease=gen_random_uuid() where id=j.id returning * into j;
  return jsonb_build_object('status','JOB','id',j.id,'lease',j.lease,'request',j.request);
 elsif p_action='complete' then
  if coalesce(p_payload->>'status','') not in ('MATCHED','UNAVAILABLE','LOGIN_REQUIRED','VERIFICATION_REQUIRED','SCHEDULE_REQUIRED','AMBIGUOUS') then return jsonb_build_object('status','INVALID_RESULT'); end if;
  update public.haynes_service_jobs set status=p_payload->>'status',result=p_payload->'result'
  where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and status='WORKING' and deadline>=now()
   and (p_payload->>'status'<>'MATCHED' or (p_payload->'result'->'vehicle'->>'registration'=request->>'registration' and p_payload->'result'->>'mileage'=request->>'mileage' and (request->>'period'='' or p_payload->'result'->>'period'=request->>'period')));
  return jsonb_build_object('status',case when found then 'SAVED' else 'EXPIRED' end);
 end if;
 return jsonb_build_object('status','INVALID_ACTION');
end $$;
revoke all on function public.haynes_service_relay(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.haynes_service_relay(text,jsonb,text) to service_role;
commit;
