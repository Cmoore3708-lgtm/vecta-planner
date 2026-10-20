-- Isolated Test project brqsejjykrubxuofavuu. No job, invoice or Haynes queue writes.
begin;
create table public.tyre_relay_runtime(id int primary key check(id=1),last_seen timestamptz);
insert into public.tyre_relay_runtime(id) values(1);
create table public.tyre_relay_jobs(
 id uuid primary key default gen_random_uuid(),size text not null,quantity int not null check(quantity between 1 and 4),
 status text not null default 'PENDING',result jsonb,lease uuid,
 created_at timestamptz not null default now(),deadline timestamptz not null default now()+interval '45 seconds'
);
create index tyre_relay_jobs_created on public.tyre_relay_jobs(created_at);
alter table public.tyre_relay_runtime enable row level security;
alter table public.tyre_relay_jobs enable row level security;
revoke all on public.tyre_relay_runtime,public.tyre_relay_jobs from public,anon,authenticated;
grant all on public.tyre_relay_runtime,public.tyre_relay_jobs to service_role;
create function public.tyre_relay(p_action text,p_payload jsonb,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.haynes_relay_worker;r public.tyre_relay_runtime;j public.tyre_relay_jobs;
begin
 select * into w from public.haynes_relay_worker where id=1;
 if p_action in ('enqueue','poll') then
  if w.site_token_hash is null or w.site_token_hash<>coalesce(p_token_hash,'') then return jsonb_build_object('status','UNAUTHORIZED');end if;
 elsif p_action in ('pull','complete') then
  if w.token_hash is null or w.token_hash<>coalesce(p_token_hash,'') then return jsonb_build_object('status','UNAUTHORIZED');end if;
 else return jsonb_build_object('status','INVALID_ACTION');end if;
 select * into r from public.tyre_relay_runtime where id=1 for update;
 delete from public.tyre_relay_jobs where created_at<now()-interval '2 days';
 update public.tyre_relay_jobs set status='UNAVAILABLE' where status in ('PENDING','WORKING') and deadline<now();
 if p_action='enqueue' then
  if coalesce(p_payload->>'size','') !~ '^[0-9]{3}/[0-9]{2}R[0-9]{2}$' or coalesce(p_payload->>'quantity','') !~ '^[1-4]$' then return jsonb_build_object('status','INVALID_REQUEST');end if;
  select * into j from public.tyre_relay_jobs where size=p_payload->>'size' and status='MATCHED' and (result->>'checkedAt')::timestamptz>now()-interval '5 minutes' order by created_at desc limit 1;
  if found then return jsonb_build_object('status','MATCHED','result',j.result);end if;
  if r.last_seen is null or r.last_seen<now()-interval '45 seconds' then return jsonb_build_object('status','OFFLINE');end if;
  select * into j from public.tyre_relay_jobs where size=p_payload->>'size' and status in ('PENDING','WORKING') limit 1;
  if found then return jsonb_build_object('status','PENDING','id',j.id);end if;
  if(select count(*) from public.tyre_relay_jobs where status in ('PENDING','WORKING'))>=3 then return jsonb_build_object('status','BUSY');end if;
  if(select count(*) from public.tyre_relay_jobs where created_at>now()-interval '24 hours')>=200 then return jsonb_build_object('status','DAILY_LIMIT');end if;
  insert into public.tyre_relay_jobs(size,quantity) values(p_payload->>'size',(p_payload->>'quantity')::int) returning * into j;
  return jsonb_build_object('status','PENDING','id',j.id);
 elsif p_action='poll' then
  select * into j from public.tyre_relay_jobs where id=(p_payload->>'id')::uuid;
  if not found then return jsonb_build_object('status','UNAVAILABLE');end if;
  return jsonb_build_object('status',case when j.status='WORKING' then 'PENDING' else j.status end,'result',j.result,'id',j.id);
 elsif p_action='pull' then
  update public.tyre_relay_runtime set last_seen=now() where id=1;
  if exists(select 1 from public.tyre_relay_jobs where status='WORKING') then return jsonb_build_object('status','IDLE');end if;
  select * into j from public.tyre_relay_jobs where status='PENDING' order by created_at limit 1;
  if not found then return jsonb_build_object('status','IDLE');end if;
  update public.tyre_relay_jobs set status='WORKING',lease=gen_random_uuid() where id=j.id returning * into j;
  return jsonb_build_object('status','JOB','id',j.id,'lease',j.lease,'size',j.size,'quantity',j.quantity);
 elsif p_action='complete' then
  if coalesce(p_payload->>'status','') not in ('MATCHED','UNAVAILABLE','LOGIN_REQUIRED','SETTINGS_REQUIRED') then return jsonb_build_object('status','INVALID_RESULT');end if;
  update public.tyre_relay_jobs set status=p_payload->>'status',result=case when p_payload->>'status'='MATCHED' then p_payload->'result' else null end
  where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and status='WORKING' and deadline>=now()
   and(p_payload->>'status'<>'MATCHED' or(p_payload->'result'->>'size'=size and jsonb_typeof(p_payload->'result'->'catalogue')='array' and (p_payload->'result'->>'checkedAt')::timestamptz between now()-interval '5 minutes' and now()+interval '1 minute'));
  return jsonb_build_object('status',case when found then 'SAVED' else 'EXPIRED' end);
 end if;
 return jsonb_build_object('status','INVALID_ACTION');
end $$;
revoke all on function public.tyre_relay(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.tyre_relay(text,jsonb,text) to service_role;
commit;
