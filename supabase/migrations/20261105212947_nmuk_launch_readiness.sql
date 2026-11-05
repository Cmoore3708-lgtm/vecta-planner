-- NMUK launch: preserve one supplier browser and the three-request queue.
-- A configurable global budget protects the worker, while browser identities
-- prevent employees on one network sharing the per-visitor allowance.
set local lock_timeout = '5s';
alter table public.gsf_service_runtime add column if not exists max_daily_jobs integer not null default 500 check(max_daily_jobs between 1 and 2000);
create index if not exists gsf_service_jobs_actor_created_idx on public.gsf_service_jobs(actor,created_at);
create index if not exists gsf_service_jobs_active_idx on public.gsf_service_jobs(created_at) where status in ('PENDING','WORKING');
create or replace function public.gsf_service_queue(p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;
revoke all on function public.gsf_service_queue(text,jsonb) from public,anon,authenticated;
grant execute on function public.gsf_service_queue(text,jsonb) to service_role;

-- Transactional receipt outbox: only new website submissions create emails.
create table if not exists public.website_booking_receipts (
 id uuid primary key references public.website_booking_requests(id) on delete cascade,
 snapshot jsonb not null, payload jsonb,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','needs_review','cancelled')),
 attempts integer not null default 0, lease uuid, lease_until timestamptz,
 first_attempt_at timestamptz, next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(), sent_at timestamptz,
 provider_id text, error text
);
alter table public.website_booking_receipts enable row level security;
revoke all on public.website_booking_receipts from public,anon,authenticated;
grant all on public.website_booking_receipts to service_role;
create index if not exists website_booking_receipts_pending_idx on public.website_booking_receipts(next_attempt_at) where status in ('pending','sending','failed');
create or replace function public.vecta_queue_booking_receipt()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 -- Public booking writes use the service role. Other workshop writes must not
 -- acquire email-sending privileges through an invoker trigger.
 if current_user not in ('service_role','postgres') then return new;end if;
 if new.source='Website booking' and new.status='awaiting_review' then
  insert into public.website_booking_receipts(id,snapshot) values(new.id,jsonb_build_object(
   'id',new.id,'registration',new.registration,'vehicle',new.vehicle,'customer_name',new.customer_name,
   'email',new.email,'confirmed_date',coalesce(new.confirmed_date,new.preferred_date_1),
   'job_types',new.job_types,'work_required',new.work_required,'approximate_cost',new.approximate_cost,
   'completion_deadline',new.completion_deadline,'status',new.status)) on conflict(id) do nothing;
 end if;
 return new;
end;$$;
revoke all on function public.vecta_queue_booking_receipt() from public,anon,authenticated;
grant execute on function public.vecta_queue_booking_receipt() to service_role;
drop trigger if exists vecta_queue_booking_receipt on public.website_booking_requests;
create trigger vecta_queue_booking_receipt after insert on public.website_booking_requests
 for each row execute function public.vecta_queue_booking_receipt();

create or replace function public.vecta_booking_receipt(p_action text,p_id uuid default null,p_lease uuid default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.website_booking_receipts; b public.website_booking_requests;
begin
 if p_action='health' then
  return (select jsonb_build_object('pending',count(*) filter(where status in ('pending','sending')),
    'failed',count(*) filter(where status in ('failed','needs_review')),
    'sent_24h',count(*) filter(where status='sent' and sent_at>now()-interval '24 hours'),
    'oldest_pending_at',min(created_at) filter(where status in ('pending','sending')))
    from public.website_booking_receipts);
 elsif p_action='status' then
  return (select jsonb_build_object('status',status) from public.website_booking_receipts where id=p_id);
 elsif p_action='claim' then
  update public.website_booking_receipts set status='needs_review',error='Automatic retry window ended. Check delivery before resending.'
   where status in ('pending','sending','failed') and (attempts>=8 or first_attempt_at<now()-interval '23 hours');
  select * into r from public.website_booking_receipts where (p_id is null or id=p_id)
   and status in ('pending','sending','failed') and next_attempt_at<=now()
   and (lease_until is null or lease_until<now())
   order by next_attempt_at,created_at for update skip locked limit 1;
  if not found then return null;end if;
  select * into b from public.website_booking_requests where id=r.id;
  if b.id is null or b.status in ('cancelled','canceled','deleted','declined','archived') then
   update public.website_booking_receipts set status='cancelled' where id=r.id;return null;
  end if;
  if b.email is distinct from r.snapshot->>'email' or coalesce(b.confirmed_date,b.preferred_date_1)::text is distinct from r.snapshot->>'confirmed_date' then
   update public.website_booking_receipts set status='needs_review',error='Booking details changed before receipt delivery.' where id=r.id;return null;
  end if;
  update public.website_booking_receipts set status='sending',attempts=attempts+1,
   lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,now())
   where id=r.id returning * into r;
  return to_jsonb(r);
 elsif p_action='prepare' then
  update public.website_booking_receipts set payload=coalesce(payload,p_payload)
   where id=p_id and lease=p_lease and status='sending' and lease_until>now() returning * into r;
  if not found then return null;end if;return to_jsonb(r);
 elsif p_action='sent' then
  update public.website_booking_receipts set status='sent',sent_at=now(),provider_id=p_payload->>'provider_id',error=null,lease_until=null
   where id=p_id and lease=p_lease and status='sending';return jsonb_build_object('saved',found);
 elsif p_action='failed' then
  update public.website_booking_receipts set status=case when attempts>=8 or p_payload->>'review'='true' then 'needs_review' else 'failed' end,
   error=left(p_payload->>'error',500),lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,power(2,attempts)::integer*30))
   where id=p_id and lease=p_lease and status='sending';return jsonb_build_object('saved',found);
 end if;
 raise exception 'Unknown receipt action';
end;$$;
revoke all on function public.vecta_booking_receipt(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_booking_receipt(text,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
