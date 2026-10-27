-- Extend only private repair queue scopes. No tables, quote records or permissions are widened.
create or replace function public.vecta_repair_quote_queue(p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.vecta_repair_quote_jobs; r public.vecta_repair_quote_runtime;
begin
 select * into r from public.vecta_repair_quote_runtime where id=1 for update;
 delete from public.vecta_repair_quote_jobs where created_at<now()-interval '2 days';
 update public.vecta_repair_quote_jobs set status='UNAVAILABLE',completed_at=now() where status in ('PENDING','WORKING') and deadline<now();
 if p_action='enqueue' then
  if coalesce(p_payload->>'actor','') !~ '^[a-f0-9]{64}$'
   or coalesce(p_payload->'request'->>'registration','') !~ '^[A-Z0-9]{2,8}$'
   or not coalesce((
    (p_payload->'request'->>'operation'='alternator-replacement' and p_payload->'request'->>'quantity'='1' and (not (p_payload->'request' ? 'selection') or p_payload->'request'->'selection'='null'::jsonb))
    or (jsonb_typeof(p_payload->'request'->'selection')='object'
     and p_payload->'request'->>'operation'=(p_payload->'request'->'selection'->>'partId')||'-replacement'
     and p_payload->'request'->'quantity'=p_payload->'request'->'selection'->'quantity'
     and (
      (p_payload->'request'->'selection'->>'partId' in ('alternator','starter-motor','battery','water-pump','thermostat','radiator','auxiliary-belt','clutch-kit','oil-filter','air-filter','cabin-filter','fuel-filter') and p_payload->'request'->'selection'->'quantity'='1'::jsonb and p_payload->'request'->'selection'->>'axle'='' and p_payload->'request'->'selection'->>'side'='')
      or (p_payload->'request'->'selection'->>'partId'='brake-pads' and p_payload->'request'->'selection'->'quantity'='1'::jsonb and p_payload->'request'->'selection'->>'axle' in ('front','rear') and p_payload->'request'->'selection'->>'side'='')
      or (p_payload->'request'->'selection'->>'partId' in ('brake-discs','brake-caliper','coil-spring','shock-absorber','suspension-arm','track-rod-end','wheel-bearing','drive-shaft') and p_payload->'request'->'selection'->>'axle' in ('front','rear')
       and ((p_payload->'request'->'selection'->>'side' in ('left','right') and p_payload->'request'->'selection'->'quantity'='1'::jsonb) or (p_payload->'request'->'selection'->>'side'='both' and p_payload->'request'->'selection'->'quantity'='2'::jsonb)))
     ))
   ),false)
   then return jsonb_build_object('status','INVALID_REQUEST');end if;
  select * into j from public.vecta_repair_quote_jobs where request=p_payload->'request' and status='MATCHED'
   and completed_at>now()-interval '5 minutes' order by completed_at desc limit 1;
  if found then return jsonb_build_object('status','MATCHED','result',j.result);end if;
  select * into j from public.vecta_repair_quote_jobs where request=p_payload->'request'
   and status not in ('PENDING','WORKING','MATCHED') and completed_at>now()-interval '30 seconds' order by completed_at desc limit 1;
  if found then return jsonb_build_object('status',j.status);end if;
  if exists(select 1 from public.vecta_repair_quote_jobs where request=p_payload->'request' and status in ('PENDING','WORKING')) then return jsonb_build_object('status','PENDING');end if;
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
end $$;
revoke all on function public.vecta_repair_quote_queue(text,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_repair_quote_queue(text,jsonb) to service_role;
