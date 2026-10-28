-- Apply to isolated Test first. No change to customer pricing/booking tables.
begin;
create table public.worker_test_runtime (
 id integer primary key check(id=1), worker_id uuid, build text, revision text,
 last_seen timestamptz, ready boolean not null default false
);
insert into public.worker_test_runtime(id) values(1);
create table public.worker_test_runs (
 id uuid primary key default gen_random_uuid(), launch_key uuid not null unique,
 status text not null check(status in ('RUNNING','PAUSED','COMPLETED','CANCELLED')),
 cohort jsonb not null, reason text, build text not null, previous_run uuid references public.worker_test_runs(id),
 created_at timestamptz not null default now(), finished_at timestamptz
);
create unique index worker_test_one_active on public.worker_test_runs((true)) where status in ('RUNNING','PAUSED');
create table public.worker_test_cases (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.worker_test_runs(id),
 position integer not null, registration text not null check(registration ~ '^[A-Z0-9]{5,8}$'),
 operation text not null check(operation in ('service','oil_filter','air_filter','cabin_filter','fuel_filter','oil')),
 request jsonb not null, status text not null default 'PENDING' check(status in ('PENDING','WORKING','PASSED','REVIEW_REQUIRED','FAILED','SKIPPED')),
 attempts integer not null default 0, lease uuid, lease_until timestamptz,
 evidence jsonb, reason text, duration_ms integer, completed_at timestamptz,
 unique(run_id,position),unique(run_id,registration,operation)
);
create index worker_test_pending on public.worker_test_cases(run_id,position) where status in ('PENDING','WORKING');
alter table public.worker_test_runtime enable row level security;
alter table public.worker_test_runs enable row level security;
alter table public.worker_test_cases enable row level security;
revoke all on public.worker_test_runtime,public.worker_test_runs,public.worker_test_cases from public,anon,authenticated;
grant all on public.worker_test_runtime,public.worker_test_runs,public.worker_test_cases to service_role;
create function public.worker_test_queue(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rt public.worker_test_runtime; r public.worker_test_runs; c public.worker_test_cases;
 rows jsonb; cohort jsonb; v jsonb; op text; n integer:=0;
begin
 -- Serialize starts, leases and acknowledgements; no duplicate work on double-click.
 select * into rt from public.worker_test_runtime where id=1 for update;
 if p_action='heartbeat' then
  update public.worker_test_runtime set worker_id=(p_payload->>'workerId')::uuid,
   build=p_payload->>'build',revision=p_payload->>'revision',last_seen=now(),ready=coalesce((p_payload->>'ready')::boolean,false) where id=1;
  return jsonb_build_object('status','READY');
 end if;
 if p_action='cohort' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from (
   select distinct on (regexp_replace(upper(registration),'\s','','g'))
    regexp_replace(upper(registration),'\s','','g') as registration,make,model,year,fuel_type
   from public.vehicles
   where regexp_replace(upper(registration),'\s','','g') ~ '^[A-Z0-9]{5,8}$'
    and registration ~ '[0-9]' and registration ~ '[A-Za-z]'
   order by regexp_replace(upper(registration),'\s','','g'),updated_at desc nulls last limit 5000
  ) x;
  return jsonb_build_object('status','READY','vehicles',rows);
 end if;
 -- Expired leases are resumable, with at most two attempts. Expired receipts
 -- cannot overwrite the next worker's attempt. No test cases touch quote caches.
 update public.worker_test_cases set status=case when attempts>=2 then 'FAILED' else 'PENDING' end,
  reason='WORKER_INTERRUPTED',evidence=jsonb_build_object('stage','WORKER_LEASE','reason','WORKER_INTERRUPTED'),
  completed_at=case when attempts>=2 then now() else null end,lease=null,lease_until=null
  where status='WORKING' and lease_until<now();
 update public.worker_test_runs run set status='COMPLETED',finished_at=now(),reason=null
  where run.status='RUNNING' and not exists(select 1 from public.worker_test_cases where worker_test_cases.run_id=run.id and status in ('PENDING','WORKING'));
 update public.worker_test_runs set status='PAUSED',reason='WORKER_OFFLINE' where status='RUNNING' and (rt.last_seen is null or rt.last_seen<now()-interval '90 seconds');
 if p_action='preflight' then
  select * into r from public.worker_test_runs where status in ('RUNNING','PAUSED') order by created_at desc limit 1;
  return jsonb_build_object('status',case when rt.last_seen is null or rt.last_seen<now()-interval '90 seconds' then 'WORKER_OFFLINE' when rt.build<>'gsf-diagnostics-v1' or rt.revision is null or not rt.ready then 'WORKER_CONFIGURATION_REQUIRED' else 'READY' end,
   'workerBuild',rt.revision,'lastSeen',rt.last_seen,'activeRun',r.id);
 end if;
 if p_action='start' then
  select * into r from public.worker_test_runs where launch_key=(p_payload->>'launchKey')::uuid;
  if found then return jsonb_build_object('status',r.status,'id',r.id);end if;
  select * into r from public.worker_test_runs where status in ('RUNNING','PAUSED') limit 1;
  if found then return jsonb_build_object('status','ACTIVE_RUN','id',r.id);end if;
  if rt.last_seen is null or rt.last_seen<now()-interval '90 seconds' then return jsonb_build_object('status','WORKER_OFFLINE');end if;
  if rt.build<>'gsf-diagnostics-v1' or rt.revision is null or not rt.ready then return jsonb_build_object('status','WORKER_CONFIGURATION_REQUIRED');end if;
  cohort=p_payload->'cohort';
  if jsonb_typeof(cohort)<>'array' or jsonb_array_length(cohort) not between 1 and 100 then return jsonb_build_object('status','INVALID_REQUEST');end if;
  if exists(select 1 from jsonb_array_elements(cohort) as entry(value) where coalesce(entry.value->>'registration','') !~ '^[A-Z0-9]{5,8}$')
   or (select count(distinct entry.value->>'registration') from jsonb_array_elements(cohort) as entry(value))<>jsonb_array_length(cohort) then return jsonb_build_object('status','INVALID_REQUEST');end if;
  insert into public.worker_test_runs(launch_key,status,cohort,build,previous_run)
   values((p_payload->>'launchKey')::uuid,'RUNNING',cohort,rt.revision,(p_payload->>'previousRun')::uuid) returning * into r;
  for v in select value from jsonb_array_elements(cohort) loop
   foreach op in array array['service','oil_filter','air_filter','cabin_filter','fuel_filter','oil'] loop
    n=n+1;
    insert into public.worker_test_cases(run_id,position,registration,operation,request)
     values(r.id,n,v->>'registration',op,jsonb_build_object('registration',v->>'registration','operation',op,'fuelType',v->>'fuelType'));
   end loop;
  end loop;
  return jsonb_build_object('status','RUNNING','id',r.id);
 end if;
 if p_action='pull' then
  if rt.worker_id is distinct from (p_payload->>'workerId')::uuid or not rt.ready or rt.last_seen<now()-interval '90 seconds' then return jsonb_build_object('status','NOT_READY');end if;
  -- Pause if a different diagnostic-capable build is installed mid-run.
  update public.worker_test_runs set status='PAUSED',reason='WORKER_BUILD_CHANGED' where status='RUNNING' and build is distinct from rt.revision;
  select * into r from public.worker_test_runs where status='RUNNING' limit 1;
  if not found then return jsonb_build_object('status','IDLE');end if;
  if exists(select 1 from public.worker_test_cases where status='WORKING') then return jsonb_build_object('status','IDLE');end if;
  select * into c from public.worker_test_cases where worker_test_cases.run_id=r.id and status='PENDING' order by position limit 1;
  if not found then return jsonb_build_object('status','IDLE');end if;
  update public.worker_test_cases set status='WORKING',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '210 seconds' where id=c.id returning * into c;
  return jsonb_build_object('status','JOB','id',c.id,'lease',c.lease,'runId',r.id,'request',c.request,'attempt',c.attempts);
 end if;
 if p_action='complete' then
  select * into c from public.worker_test_cases where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid;
  if not found then return jsonb_build_object('status','EXPIRED');end if;
  if c.status in ('PASSED','REVIEW_REQUIRED','FAILED','SKIPPED') then return jsonb_build_object('status','SAVED');end if;
  select * into r from public.worker_test_runs where id=c.run_id;
  if c.status<>'WORKING' or c.lease_until<now() or r.status='CANCELLED' then return jsonb_build_object('status','EXPIRED');end if;
  if p_payload->>'outcome'='PAUSED' then
   update public.worker_test_cases set status='PENDING',attempts=greatest(0,attempts-1),lease=null,lease_until=null,
    reason=p_payload->>'reason',evidence=p_payload->'evidence' where id=c.id;
   update public.worker_test_runs set status='PAUSED',reason=p_payload->>'reason' where id=r.id;
  else
   if coalesce(p_payload->>'outcome','') not in ('PASSED','REVIEW_REQUIRED','FAILED','SKIPPED') then return jsonb_build_object('status','INVALID_RESULT');end if;
   update public.worker_test_cases set status=case when p_payload->>'outcome'='FAILED' and p_payload->>'reason' in ('LOOKUP_TIMEOUT','NETWORK_ERROR') and attempts<2 then 'PENDING' else p_payload->>'outcome' end,
    reason=p_payload->>'reason',evidence=p_payload->'evidence',duration_ms=(p_payload->>'durationMs')::integer,
    completed_at=now() where id=c.id;
   if not exists(select 1 from public.worker_test_cases where worker_test_cases.run_id=r.id and status in ('PENDING','WORKING')) then
    update public.worker_test_runs set status='COMPLETED',finished_at=now(),reason=null where id=r.id and status='RUNNING';
   end if;
  end if;
  return jsonb_build_object('status','SAVED');
 end if;
 if p_action in ('status','pause','resume','cancel') then
  if p_payload->>'id' is null then select * into r from public.worker_test_runs order by created_at desc limit 1;
  else select * into r from public.worker_test_runs where id=(p_payload->>'id')::uuid;end if;
  if not found then return jsonb_build_object('status','NO_RUN');end if;
  if p_action='pause' and r.status='RUNNING' then update public.worker_test_runs set status='PAUSED',reason='MANUALLY_PAUSED' where id=r.id returning * into r;end if;
  if p_action='resume' and r.status='PAUSED' then
   if rt.last_seen is null or rt.last_seen<now()-interval '90 seconds' then return jsonb_build_object('status','WORKER_OFFLINE','id',r.id);end if;
   if not rt.ready then return jsonb_build_object('status','WORKER_CONFIGURATION_REQUIRED','id',r.id);end if;
   -- Preserve the original build: rerun on a new build creates a separate comparison run.
   if r.build<>rt.revision then return jsonb_build_object('status','WORKER_BUILD_CHANGED','id',r.id);end if;
   update public.worker_test_runs set status='RUNNING',reason=null where id=r.id returning * into r;
  end if;
  if p_action='cancel' and r.status in ('RUNNING','PAUSED') then
   update public.worker_test_runs set status='CANCELLED',finished_at=now(),reason='CANCELLED' where id=r.id returning * into r;
   update public.worker_test_cases set status='PENDING',lease=null,lease_until=null,reason='CANCELLED' where worker_test_cases.run_id=r.id and status='WORKING';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.position),'[]') into rows from (
   select id,position,registration,operation,status,attempts,evidence,reason,duration_ms,completed_at from public.worker_test_cases where worker_test_cases.run_id=r.id
  ) x;
  return jsonb_build_object('status',r.status,'run',to_jsonb(r)-'launch_key','cases',rows);
 end if;
 return jsonb_build_object('status','INVALID_ACTION');
end $$;
revoke all on function public.worker_test_queue(text,jsonb) from public,anon,authenticated;
grant execute on function public.worker_test_queue(text,jsonb) to service_role;
commit;
