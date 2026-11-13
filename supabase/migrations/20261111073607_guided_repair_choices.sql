-- Staged only. Protocol 3 is required for the part-first choice flow.
set local lock_timeout='5s';
alter table public.vecta_repair_quote_runtime drop constraint if exists vecta_repair_quote_runtime_repair_protocol_check;
alter table public.vecta_repair_quote_runtime add constraint vecta_repair_quote_runtime_repair_protocol_check check (repair_protocol in (1,2,3));
alter table public.vecta_repair_quote_jobs drop constraint if exists vecta_repair_quote_jobs_status_check;
alter table public.vecta_repair_quote_jobs add constraint vecta_repair_quote_jobs_status_check check (status in ('PENDING','WORKING','MATCHED','CHOICE_REQUIRED','LOGIN_REQUIRED','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','SETTINGS_REQUIRED','OUT_OF_STOCK','UNAVAILABLE'));
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
   or coalesce(p_payload->'request'->>'operation','') not in ('alternator-replacement','catalogue-replacement')
   or coalesce(p_payload->'request'->>'quantity','') !~ '^(?:[1-9]|1[0-9]|20)$'
   or length(coalesce(p_payload->'request'->>'work','')) not between 2 and 250
   or (p_payload->'request'->>'operation'='alternator-replacement' and p_payload->'request'->>'quantity'<>'1')
   then return jsonb_build_object('status','INVALID_REQUEST');end if;
  if p_payload->'request' ? 'flow' and (p_payload->'request'->>'flow'<>'guided-v1' or jsonb_typeof(p_payload->'request'->'choices') is distinct from 'object') then return jsonb_build_object('status','INVALID_REQUEST');end if;
  if p_payload->'request'->>'flow'='guided-v1' and r.repair_protocol<3 then return jsonb_build_object('status','SETTINGS_REQUIRED');end if;
  if p_payload->'request'->>'operation'='catalogue-replacement' and r.repair_protocol<2 then return jsonb_build_object('status','SETTINGS_REQUIRED');end if;
  select * into j from public.vecta_repair_quote_jobs where request=p_payload->'request' and status in ('MATCHED','CHOICE_REQUIRED')
   and completed_at>now()-interval '5 minutes' order by completed_at desc limit 1;
  if found then return jsonb_build_object('status',j.status,'result',j.result);end if;
  select * into j from public.vecta_repair_quote_jobs where request=p_payload->'request'
   and status not in ('PENDING','WORKING','MATCHED','CHOICE_REQUIRED') and completed_at>now()-interval '30 seconds' order by completed_at desc limit 1;
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
  update public.vecta_repair_quote_runtime set last_seen=now(),repair_protocol=case when p_payload->>'repairProtocol' in ('2','3') then (p_payload->>'repairProtocol')::integer else 1 end where id=1;
  if exists(select 1 from public.vecta_repair_quote_jobs where status='WORKING') then return jsonb_build_object('status','IDLE');end if;
  select * into j from public.vecta_repair_quote_jobs where status='PENDING' and (p_payload->>'repairProtocol'='3' or (not(request ? 'flow') and (p_payload->>'repairProtocol'='2' or request->>'operation'='alternator-replacement'))) order by created_at,id limit 1;
  if not found then return jsonb_build_object('status','IDLE');end if;
  update public.vecta_repair_quote_jobs set status='WORKING',lease=gen_random_uuid() where id=j.id returning * into j;
  return jsonb_build_object('status','JOB','id',j.id,'lease',j.lease,'request',j.request);
 elsif p_action='complete' then
  if coalesce(p_payload->>'status','') not in ('MATCHED','CHOICE_REQUIRED','LOGIN_REQUIRED','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','SETTINGS_REQUIRED','OUT_OF_STOCK','UNAVAILABLE') then return jsonb_build_object('status','INVALID_RESULT');end if;
  if exists(select 1 from public.vecta_repair_quote_jobs where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and request=p_payload->'request'
   and status=p_payload->>'status' and result is not distinct from case when p_payload->>'status' in ('MATCHED','CHOICE_REQUIRED') then p_payload->'result' else null end)
   then return jsonb_build_object('status','SAVED');end if;
  update public.vecta_repair_quote_jobs set status=p_payload->>'status',completed_at=now(),result=case when p_payload->>'status' in ('MATCHED','CHOICE_REQUIRED') then p_payload->'result' else null end
   where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and request=p_payload->'request' and status='WORKING' and deadline>=now()
   and (p_payload->>'status' not in ('MATCHED','CHOICE_REQUIRED') or (p_payload->'result'->'request'=request and ((p_payload->>'status'='MATCHED' and jsonb_typeof(p_payload->'result'->'parts')='array') or (p_payload->>'status'='CHOICE_REQUIRED' and request->>'flow'='guided-v1' and jsonb_typeof(p_payload->'result'->'options')='array' and p_payload->'result'->>'stage' in ('GSF_CATEGORY','GSF_PART','HAYNES_MENU','HAYNES_LABOUR')))
    and (p_payload->'result'->>'checkedAt')::timestamptz between now()-interval '5 minutes' and now()+interval '1 minute'));
  return jsonb_build_object('status',case when found then 'SAVED' else 'EXPIRED' end);
 end if;
 return jsonb_build_object('status','INVALID_ACTION');
end $function$;

revoke all on function public.vecta_repair_quote_queue(text,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_repair_quote_queue(text,jsonb) to service_role;
