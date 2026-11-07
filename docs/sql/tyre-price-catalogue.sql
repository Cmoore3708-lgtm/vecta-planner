-- Apply only to the existing ESP relay project brqsejjykrubxuofavuu.
-- Additive, compatible with existing workers and website clients.
begin;
create table public.tyre_price_catalogue (
 size text primary key check(size ~ '^[0-9]{3}/[0-9]{2}R[0-9]{2}$'),
 result jsonb, checked_at timestamptz, search_count integer not null default 0,
 priority integer not null default 1000, last_requested_at timestamptz,
 last_attempt_at timestamptz,
 check((result is null) = (checked_at is null))
);
alter table public.tyre_price_catalogue enable row level security;
revoke all on public.tyre_price_catalogue from public,anon,authenticated;
grant all on public.tyre_price_catalogue to service_role;
alter table public.tyre_relay_jobs add column background boolean not null default false;
alter table public.tyre_relay_runtime add column background_after timestamptz;
create index tyre_relay_jobs_background_created on public.tyre_relay_jobs(created_at) where background;
-- A practical initial coverage list, not a claim about national sales rankings.
insert into public.tyre_price_catalogue(size,priority)
select size,position from unnest(array[
 '205/55R16','225/45R17','225/40R18','195/65R15','205/60R16','215/55R17',
 '215/60R17','225/45R18','225/50R17','215/50R17','205/55R17','195/55R16',
 '185/65R15','195/55R15','185/60R15','175/65R14','175/65R15','165/65R14',
 '185/55R15','195/60R15','205/45R17','205/50R17','215/45R17','215/45R18',
 '225/55R17','225/55R18','225/60R17','225/60R18','225/65R17','215/65R16',
 '215/60R16','205/65R16','215/55R16','205/50R16','195/50R15','185/60R14',
 '235/55R18','235/45R18','235/40R18','235/50R18','235/45R19','235/55R19',
 '235/50R19','245/45R18','245/40R18','245/40R19','245/45R19','245/35R19',
 '255/35R19','255/40R19','255/45R20','235/60R18','235/65R17','235/55R20',
 '255/55R18','255/50R19','255/50R20','265/35R19','275/40R20','225/40R19'
]) with ordinality as sizes(size,position);
-- Preserve genuine retained successes before the two-day queue cleanup.
insert into public.tyre_price_catalogue(size,result,checked_at)
select distinct on(size) size,result,(result->>'checkedAt')::timestamptz
from public.tyre_relay_jobs
where status='MATCHED' and result->>'size'=size and jsonb_typeof(result->'catalogue')='array'
 and exists(select 1 from jsonb_array_elements(result->'catalogue') row
  where (row->>'unitPence')::numeric>0 and (row->>'defaultStockMinimum')::numeric>0)
order by size,(result->>'checkedAt')::timestamptz desc
on conflict(size) do update set result=excluded.result,checked_at=excluded.checked_at;

create or replace function public.tyre_relay(p_action text,p_payload jsonb,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.haynes_relay_worker;r public.tyre_relay_runtime;j public.tyre_relay_jobs;c public.tyre_price_catalogue;
begin
 select * into w from public.haynes_relay_worker where id=1;
 if p_action in ('enqueue','cached','poll') then
  if w.site_token_hash is null or w.site_token_hash<>coalesce(p_token_hash,'') then return jsonb_build_object('status','UNAUTHORIZED');end if;
 elsif p_action in ('pull','complete') then
  if w.token_hash is null or w.token_hash<>coalesce(p_token_hash,'') then return jsonb_build_object('status','UNAUTHORIZED');end if;
 else return jsonb_build_object('status','INVALID_ACTION');end if;
 select * into r from public.tyre_relay_runtime where id=1 for update;
 if p_action in ('enqueue','cached') then
  if coalesce(p_payload->>'size','') !~ '^[0-9]{3}/[0-9]{2}R[0-9]{2}$' or coalesce(p_payload->>'quantity','') !~ '^[1-4]$' then return jsonb_build_object('status','INVALID_REQUEST');end if;
 end if;
 if p_action='cached' then
  select * into c from public.tyre_price_catalogue where size=p_payload->>'size' and checked_at>now()-interval '90 days' and checked_at<=now()+interval '1 minute';
  if found then return jsonb_build_object('status','MATCHED','result',c.result,'priceSource','saved');end if;
  return jsonb_build_object('status','UNAVAILABLE');
 end if;
 -- Keep lookup history. Expire leases without deleting any stored prices or jobs.
 update public.tyre_relay_jobs set status='UNAVAILABLE' where status in ('PENDING','WORKING') and deadline<now();
 if p_action='enqueue' then
  insert into public.tyre_price_catalogue(size,search_count,last_requested_at)
   values(p_payload->>'size',1,now()) on conflict(size) do update
   set search_count=public.tyre_price_catalogue.search_count+1,last_requested_at=now();
  select * into c from public.tyre_price_catalogue where size=p_payload->>'size' and checked_at>now()-interval '5 minutes' and checked_at<=now()+interval '1 minute';
  if found then return jsonb_build_object('status','MATCHED','result',c.result);end if;
  if r.last_seen is null or r.last_seen<now()-interval '45 seconds' then return jsonb_build_object('status','OFFLINE');end if;
  select * into j from public.tyre_relay_jobs where size=p_payload->>'size' and status in ('PENDING','WORKING') limit 1;
  if found then return jsonb_build_object('status','PENDING','id',j.id);end if;
  if(select count(*) from public.tyre_relay_jobs where status in ('PENDING','WORKING'))>=3 then return jsonb_build_object('status','BUSY');end if;
  if(select count(*) from public.tyre_relay_jobs where not background and created_at>now()-interval '24 hours')>=200 then return jsonb_build_object('status','DAILY_LIMIT');end if;
  insert into public.tyre_relay_jobs(size,quantity) values(p_payload->>'size',(p_payload->>'quantity')::int) returning * into j;
  return jsonb_build_object('status','PENDING','id',j.id);
 elsif p_action='poll' then
  select * into j from public.tyre_relay_jobs where id=(p_payload->>'id')::uuid;
  if not found then return jsonb_build_object('status','UNAVAILABLE');end if;
  return jsonb_build_object('status',case when j.status='WORKING' then 'PENDING' else j.status end,'result',j.result,'id',j.id);
 elsif p_action='pull' then
  update public.tyre_relay_runtime set last_seen=now() where id=1;
  if exists(select 1 from public.tyre_relay_jobs where status='WORKING') then return jsonb_build_object('status','IDLE');end if;
  select * into j from public.tyre_relay_jobs where status='PENDING' order by background,created_at limit 1;
  if not found then
   -- One small read-only lookup while idle; no shopping-cart or supplier orders.
   -- A customer already waiting always wins. An in-flight lookup stays bounded.
   if r.background_after>now()
    or exists(select 1 from public.tyre_price_catalogue where last_requested_at>now()-interval '1 minute')
    or exists(select 1 from public.tyre_relay_jobs where background and created_at>now()-interval '10 minutes')
    or (select count(*) from public.tyre_relay_jobs where background and created_at>now()-interval '24 hours')>=40
    then return jsonb_build_object('status','IDLE');end if;
   select * into c from public.tyre_price_catalogue
    where (checked_at is null or checked_at<now()-interval '7 days')
     and (last_attempt_at is null or last_attempt_at<now()-interval '1 day')
    order by (checked_at is not null),search_count desc,priority,checked_at nulls first,size limit 1;
   if not found then return jsonb_build_object('status','IDLE');end if;
   insert into public.tyre_relay_jobs(size,quantity,background) values(c.size,1,true) returning * into j;
  end if;
  update public.tyre_price_catalogue set last_attempt_at=now() where size=j.size;
  update public.tyre_relay_jobs set status='WORKING',lease=gen_random_uuid() where id=j.id returning * into j;
  return jsonb_build_object('status','JOB','id',j.id,'lease',j.lease,'size',j.size,'quantity',j.quantity);
 elsif p_action='complete' then
  if coalesce(p_payload->>'status','') not in ('MATCHED','UNAVAILABLE','LOGIN_REQUIRED','SETTINGS_REQUIRED') then return jsonb_build_object('status','INVALID_RESULT');end if;
  update public.tyre_relay_jobs set status=p_payload->>'status',result=case when p_payload->>'status'='MATCHED' then p_payload->'result' else null end
  where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and status='WORKING' and deadline>=now()
   and(p_payload->>'status'<>'MATCHED' or(p_payload->'result'->>'size'=size and jsonb_typeof(p_payload->'result'->'catalogue')='array' and (p_payload->'result'->>'checkedAt')::timestamptz between now()-interval '5 minutes' and now()+interval '1 minute'))
   returning * into j;
  if not found then return jsonb_build_object('status','EXPIRED');end if;
  if j.status='MATCHED' and exists(select 1 from jsonb_array_elements(j.result->'catalogue') row
    where (row->>'unitPence')::numeric>0 and (row->>'defaultStockMinimum')::numeric>0) then
   insert into public.tyre_price_catalogue(size,result,checked_at,last_attempt_at)
    values(j.size,j.result,(j.result->>'checkedAt')::timestamptz,now())
    on conflict(size) do update set result=excluded.result,checked_at=excluded.checked_at,last_attempt_at=excluded.last_attempt_at
     where public.tyre_price_catalogue.checked_at is null or public.tyre_price_catalogue.checked_at<=excluded.checked_at;
  end if;
  if j.status in ('LOGIN_REQUIRED','SETTINGS_REQUIRED') or (j.background and j.status<>'MATCHED') then
   update public.tyre_relay_runtime set background_after=now()+interval '1 hour' where id=1;
  end if;
  return jsonb_build_object('status','SAVED');
 end if;
 return jsonb_build_object('status','INVALID_ACTION');
end $$;
revoke all on function public.tyre_relay(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.tyre_relay(text,jsonb,text) to service_role;
commit;
