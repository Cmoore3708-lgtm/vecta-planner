-- Service and repair share one serial GSF browser. A valid sibling lease means BUSY.
set local lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.gsf_service_queue(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.gsf_service_jobs; r public.gsf_service_runtime;
begin
  if p_action='health' then
    return (select jsonb_build_object('last_seen',rt.last_seen,'daily_limit',rt.max_daily_jobs,
      'active',(select count(*) from public.gsf_service_jobs where status in ('PENDING','WORKING') and deadline>now()),
      'oldest_wait_seconds',(select coalesce(extract(epoch from now()-min(created_at))::integer,0) from public.gsf_service_jobs where status in ('PENDING','WORKING') and deadline>now()),
      'working',(select count(*) from public.gsf_service_jobs where status='WORKING' and deadline>now()),
      'requests_24h',(select count(*) from public.gsf_service_jobs where created_at>now()-interval '24 hours'),
      'matched_24h',(select count(*) from public.gsf_service_jobs where created_at>now()-interval '24 hours' and status='MATCHED'),
      'failed_24h',(select count(*) from public.gsf_service_jobs where created_at>now()-interval '24 hours' and (status in ('LOGIN_REQUIRED','REVIEW_REQUIRED','SETTINGS_REQUIRED','UNAVAILABLE') or (status in ('PENDING','WORKING') and deadline<now()))))
    from public.gsf_service_runtime rt where id=1);
  end if;
  -- Single runtime lock makes deduplication and leasing atomic across server instances.
  select * into r from public.gsf_service_runtime where id=1 for update;
  delete from public.gsf_service_jobs where created_at<now()-interval '2 days';
  update public.gsf_service_jobs set status='UNAVAILABLE',completed_at=now()
    where status in ('PENDING','WORKING') and deadline<now();
  if p_action='enqueue' then
    if coalesce(p_payload->>'actor','') !~ '^[a-f0-9]{64}$'
      or coalesce(p_payload->'request'->>'registration','') !~ '^[A-Z0-9]{5,8}$'
      or coalesce(p_payload->'request'->>'service','') not in ('Oil & Filter Change','Full Service','Major Service','Interim Service','EV Major Service')
      or coalesce(p_payload->'request'->>'range','') not in ('Budget','Mid Range','Premium/Dealer')
      then return jsonb_build_object('status','INVALID_REQUEST'); end if;
    select * into j from public.gsf_service_jobs where request=p_payload->'request'
      and status='MATCHED' and completed_at>now()-interval '5 minutes'
      and (result->>'checkedAt')::timestamptz>now()-interval '5 minutes'
      order by completed_at desc limit 1;
    if found then return jsonb_build_object('status','MATCHED','result',j.result); end if;
    select * into j from public.gsf_service_jobs where request=p_payload->'request'
      and status in ('LOGIN_REQUIRED','REVIEW_REQUIRED','SETTINGS_REQUIRED','UNAVAILABLE')
      and completed_at>now()-interval '1 minute' order by completed_at desc limit 1;
    if found then return jsonb_build_object('status',j.status); end if;
    if exists(select 1 from public.gsf_service_jobs where request=p_payload->'request' and status in ('PENDING','WORKING')) then
      return jsonb_build_object('status','PENDING'); end if;
    -- The two queues share one PC reader. Preserve cached and existing requests above.
    if exists(select 1 from public.vecta_repair_quote_jobs
      where status='WORKING' and lease is not null and deadline>now())
      then return jsonb_build_object('status','BUSY'); end if;
    -- The existing PC polls between lookups. A valid in-flight lease is activity,
    -- even when a lookup takes more than 45 seconds. No PC update is required.
    if (r.last_seen is null or r.last_seen<now()-interval '45 seconds') and not exists(
      select 1 from public.gsf_service_jobs where status='WORKING' and deadline>now()
    ) then return jsonb_build_object('status','OFFLINE'); end if;
    if (select count(*) from public.gsf_service_jobs where status in ('PENDING','WORKING'))>=3 then return jsonb_build_object('status','BUSY'); end if;
    if (select count(*) from public.gsf_service_jobs where created_at>now()-interval '24 hours')>=r.max_daily_jobs
      or (select count(*) from public.gsf_service_jobs where actor=p_payload->>'actor' and created_at>now()-interval '1 hour')>=15
      then return jsonb_build_object('status','DAILY_LIMIT'); end if;
    insert into public.gsf_service_jobs(request,actor) values(p_payload->'request',p_payload->>'actor');
    return jsonb_build_object('status','PENDING');
  elsif p_action='pull' then
    update public.gsf_service_runtime set last_seen=now() where id=1;
    if exists(select 1 from public.gsf_service_jobs where status='WORKING') then return jsonb_build_object('status','IDLE'); end if;
    select * into j from public.gsf_service_jobs where status='PENDING' order by created_at limit 1;
    if not found then return jsonb_build_object('status','IDLE'); end if;
    update public.gsf_service_jobs set status='WORKING',lease=gen_random_uuid() where id=j.id returning * into j;
    return jsonb_build_object('status','JOB','id',j.id,'lease',j.lease,'request',j.request);
  elsif p_action='complete' then
    update public.gsf_service_runtime set last_seen=now() where id=1;
    if coalesce(p_payload->>'status','') not in ('MATCHED','LOGIN_REQUIRED','REVIEW_REQUIRED','SETTINGS_REQUIRED','UNAVAILABLE') then return jsonb_build_object('status','INVALID_RESULT'); end if;
    if exists(select 1 from public.gsf_service_jobs where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid
      and request=p_payload->'request' and status=p_payload->>'status' and status not in ('PENDING','WORKING')
      and result is not distinct from case when p_payload->>'status'='MATCHED' then p_payload->'result' else null end)
      then return jsonb_build_object('status','SAVED'); end if;
    update public.gsf_service_jobs set status=p_payload->>'status',completed_at=now(),
      result=case when p_payload->>'status'='MATCHED' then p_payload->'result' else null end
      where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and status='WORKING'
      and deadline>=now() and request=p_payload->'request'
      and (p_payload->>'status'<>'MATCHED' or (
        p_payload->'result'->'request'=request and jsonb_typeof(p_payload->'result'->'items')='array'
        and (p_payload->'result'->>'checkedAt')::timestamptz between now()-interval '5 minutes' and now()+interval '1 minute'));
    return jsonb_build_object('status',case when found then 'SAVED' else 'EXPIRED' end);
  end if;
  return jsonb_build_object('status','INVALID_ACTION');
end $function$;

CREATE OR REPLACE FUNCTION public.vecta_repair_quote_queue(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.vecta_repair_quote_jobs; r public.vecta_repair_quote_runtime;
begin
 select * into r from public.vecta_repair_quote_runtime where id=1 for update;
 delete from public.vecta_repair_quote_jobs where created_at<now()-interval '2 days';
 update public.vecta_repair_quote_jobs set status='UNAVAILABLE',completed_at=now() where status in ('PENDING','WORKING') and deadline<now();
 if p_action='enqueue' then
  if coalesce(p_payload->>'actor','') !~ '^[a-f0-9]{64}$'
   or coalesce(p_payload->'request'->>'registration','') !~ '^[A-Z0-9]{2,8}$'
   or coalesce(p_payload->'request'->>'operation','')<>'alternator-replacement'
   or coalesce(p_payload->'request'->>'quantity','')<>'1'
   then return jsonb_build_object('status','INVALID_REQUEST');end if;
  select * into j from public.vecta_repair_quote_jobs where request=p_payload->'request' and status='MATCHED'
   and completed_at>now()-interval '5 minutes' order by completed_at desc limit 1;
  if found then return jsonb_build_object('status','MATCHED','result',j.result);end if;
  select * into j from public.vecta_repair_quote_jobs where request=p_payload->'request'
   and status not in ('PENDING','WORKING','MATCHED') and completed_at>now()-interval '30 seconds' order by completed_at desc limit 1;
  if found then return jsonb_build_object('status',j.status);end if;
  if exists(select 1 from public.vecta_repair_quote_jobs where request=p_payload->'request' and status in ('PENDING','WORKING')) then return jsonb_build_object('status','PENDING');end if;
  if exists(select 1 from public.gsf_service_jobs
    where status='WORKING' and lease is not null and deadline>now())
    then return jsonb_build_object('status','BUSY');end if;
  -- A working task may take longer than the idle heartbeat interval.
  if (r.last_seen is null or r.last_seen<now()-interval '30 seconds') and not exists(select 1 from public.vecta_repair_quote_jobs where status='WORKING') then return jsonb_build_object('status','OFFLINE');end if;
  if (select count(*) from public.vecta_repair_quote_jobs where status in ('PENDING','WORKING'))>=3 then return jsonb_build_object('status','BUSY');end if;
  if (select count(*) from public.vecta_repair_quote_jobs where created_at>now()-interval '24 hours')>=100
    or (select count(*) from public.vecta_repair_quote_jobs where actor=p_payload->>'actor' and created_at>now()-interval '1 hour')>=20 then return jsonb_build_object('status','DAILY_LIMIT');end if;
  insert into public.vecta_repair_quote_jobs(request,actor) values(p_payload->'request',p_payload->>'actor');
  return jsonb_build_object('status','PENDING');
 elsif p_action='pull' then
  update public.vecta_repair_quote_runtime set last_seen=now() where id=1;
  if exists(select 1 from public.vecta_repair_quote_jobs where status='WORKING') then return jsonb_build_object('status','IDLE');end if;
  select * into j from public.vecta_repair_quote_jobs where status='PENDING' order by created_at,id limit 1;
  if not found then return jsonb_build_object('status','IDLE');end if;
  update public.vecta_repair_quote_jobs set status='WORKING',lease=gen_random_uuid() where id=j.id returning * into j;
  return jsonb_build_object('status','JOB','id',j.id,'lease',j.lease,'request',j.request);
 elsif p_action='complete' then
  if coalesce(p_payload->>'status','') not in ('MATCHED','LOGIN_REQUIRED','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','SETTINGS_REQUIRED','OUT_OF_STOCK','UNAVAILABLE') then return jsonb_build_object('status','INVALID_RESULT');end if;
  if exists(select 1 from public.vecta_repair_quote_jobs where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and request=p_payload->'request'
   and status=p_payload->>'status' and result is not distinct from case when p_payload->>'status'='MATCHED' then p_payload->'result' else null end)
   then return jsonb_build_object('status','SAVED');end if;
  update public.vecta_repair_quote_jobs set status=p_payload->>'status',completed_at=now(),result=case when p_payload->>'status'='MATCHED' then p_payload->'result' else null end
   where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and request=p_payload->'request' and status='WORKING' and deadline>=now()
   and (p_payload->>'status'<>'MATCHED' or (p_payload->'result'->'request'=request and jsonb_typeof(p_payload->'result'->'parts')='array'
    and (p_payload->'result'->>'checkedAt')::timestamptz between now()-interval '5 minutes' and now()+interval '1 minute'));
  return jsonb_build_object('status',case when found then 'SAVED' else 'EXPIRED' end);
 end if;
 return jsonb_build_object('status','INVALID_ACTION');
end $function$;

revoke all on function public.gsf_service_queue(text,jsonb), public.vecta_repair_quote_queue(text,jsonb) from public,anon,authenticated;
grant execute on function public.gsf_service_queue(text,jsonb), public.vecta_repair_quote_queue(text,jsonb) to service_role;
