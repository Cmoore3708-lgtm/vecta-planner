-- Shared server-side availability and admission rules. Existing requests remain intact.
set local lock_timeout = '5s';
create table if not exists public.website_booking_requests (
 id uuid primary key,created_at timestamptz not null default now(),customer_name text not null,
 email text not null,phone text not null,registration text not null,vehicle text not null,mileage text,
 job_types jsonb not null default '[]',work_required text not null,preferred_date_1 date not null,
 preferred_date_2 date,preferred_date_3 date,completion_deadline text,contact_preference text default 'Email',
 source text default 'Website booking',status text not null default 'awaiting_review',confirmed_date date,
 confirmed_at timestamptz,approximate_cost numeric,job_id uuid,mot_due date
);
alter table public.website_booking_requests add column if not exists confirmed_time time;
alter table public.website_booking_requests enable row level security;
grant all on public.website_booking_requests to service_role;
create or replace function public.website_booking_duration_hours(types jsonb)
returns numeric language sql immutable security invoker set search_path = '' as $$
 select greatest(0.5,least(8,coalesce(nullif(sum(case
  when value ~* 'major service' then 2.5
  when value ~* 'full service' then 1.5
  when value ~* 'interim service|oil.*filter|^service$' then 1
  when value ~* '^mot$' then 1
  when value ~* 'diagnostic' then 2
  when value ~* 'brake|tyre' then 1.5
  when value ~* 'other' then 1
  else 0 end),0),1)))
 from jsonb_array_elements_text(case when jsonb_typeof(types)='array' then types else '[]'::jsonb end);
$$;
revoke all on function public.website_booking_duration_hours(jsonb) from public, anon, authenticated;
grant execute on function public.website_booking_duration_hours(jsonb) to service_role;


create or replace function public.vecta_booking_earliest(p_types jsonb,p_now timestamptz default now())
returns date language plpgsql immutable security invoker set search_path='' as $$
declare d date:=(p_now at time zone 'Europe/London')::date; n integer:=0;
begin
 if exists(select 1 from jsonb_array_elements_text(p_types) x where x ~* '^mot$') then d:=d+9;
 else
  while n<2 loop d:=d+1;if extract(isodow from d)<=5 then n:=n+1;end if;end loop;
  d:=d+1;
 end if;
 while extract(isodow from d) not in (2,3,4,5) loop d:=d+1;end loop;
 return d;
end;$$;

create or replace function public.vecta_online_booking_slot(p_date date,p_types jsonb,p_now timestamptz default now())
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 busy boolean[]:=array_fill(false,array[480]); start_min integer;end_min integer;i integer;s integer;
 dur integer:=ceil(public.website_booking_duration_hours(p_types)*2)::integer*30;
 booked integer:=0;off_minutes integer:=0;r record;item jsonb;settings jsonb;
 pending_start integer;pending_duration integer;found_slot boolean;is_friday boolean:=extract(isodow from p_date)=5;
begin
 if p_date<public.vecta_booking_earliest(p_types,p_now) or extract(isodow from p_date) not in (2,3,4,5) then return null;end if;
 select value->'mechanicTimeOff' into settings from public.workshop_settings where id='main';
 for item in select value from jsonb_array_elements(coalesce(settings,'[]')) loop
  if item->>'mechanic'='Alfie' and p_date between (item->>'start_date')::date and (item->>'end_date')::date then
   start_min:=case when p_date=(item->>'start_date')::date then extract(epoch from coalesce(nullif(item->>'start_time','')::time,'08:00'::time))/60 else 480 end;
   end_min:=case when p_date=(item->>'end_date')::date then extract(epoch from coalesce(nullif(item->>'end_time','')::time,'16:00'::time))/60 else 960 end;
   for i in greatest(480,start_min)..least(959,end_min-1) loop busy[i-479]:=true;end loop;
  end if;
 end loop;
 select count(*) into off_minutes from unnest(busy) b where b;
 if is_friday then for i in 390..479 loop busy[i+1]:=true;end loop;end if;
 for r in select drop_time,estimated_hours from public.jobs where booking_date=p_date and technician='Alfie'
  and not coalesce(archived,false) and lower(coalesce(status,'')) not in ('completed','cancelled','deleted','quote') loop
  start_min:=extract(epoch from coalesce(r.drop_time,'08:00'::time))/60;
  end_min:=start_min+greatest(30,ceil(coalesce(nullif(r.estimated_hours,0),1)*2)::integer*30);
  booked:=booked+end_min-start_min;
  for i in greatest(480,start_min)..least(959,end_min-1) loop busy[i-479]:=true;end loop;
 end loop;
 for r in select confirmed_time,job_types from public.website_booking_requests
  where coalesce(confirmed_date,preferred_date_1)=p_date and status in ('awaiting_review','contacted') and source='Website booking'
  order by (confirmed_time is null),created_at,id loop
  pending_duration:=ceil(public.website_booking_duration_hours(r.job_types)*2)::integer*30;
  booked:=booked+pending_duration;
  pending_start:=null;
  if r.confirmed_time is not null then pending_start:=extract(epoch from r.confirmed_time)/60-480;
  else
   for s in 0..(480-pending_duration) by 30 loop
    if not exists(select 1 from unnest(busy[s+1:s+pending_duration]) b where b) then pending_start:=s;exit;end if;
   end loop;
  end if;
  if pending_start is null then return null;end if;
  for i in greatest(0,pending_start)..least(479,pending_start+pending_duration-1) loop busy[i+1]:=true;end loop;
 end loop;
 if is_friday then if booked+dur>240 then return null;end if;
 elsif booked+off_minutes+dur>360 then return null;
 end if;
 for s in 0..(480-dur) by 30 loop
  if not exists(select 1 from unnest(busy[s+1:s+dur]) b where b) then
   return jsonb_build_object('date',p_date,'time',to_char(time '08:00'+s*interval '1 minute','HH24:MI'),
    'technician','Alfie','hours',dur/60.0,'booked_percentage',round(booked/480.0*100),'max_booked_percentage',case when is_friday then 50 else 75 end);
  end if;
 end loop;
 return null;
end;$$;

create or replace function public.vecta_online_booking_availability(p_types jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare first_date date:=public.vecta_booking_earliest(p_types);slots jsonb;
begin
 if jsonb_typeof(p_types)<>'array' or jsonb_array_length(p_types)>12 then raise exception 'Invalid work types';end if;
 select coalesce(jsonb_agg(slot order by day),'[]') into slots from (
  select first_date+n as day,public.vecta_online_booking_slot(first_date+n,p_types) slot from generate_series(0,179) n
 ) x where slot is not null;
 return jsonb_build_object('slots',slots,'earliest_date',first_date,'hours',public.website_booking_duration_hours(p_types),
 'technician','Alfie','max_booked_percentage',75,'friday_max_booked_percentage',50,'closed_weekdays',jsonb_build_array(0,1,6),
 'mot_lead_days',case when exists(select 1 from jsonb_array_elements_text(p_types) x where x ~* '^mot$') then 9 else 0 end);
end;$$;

create or replace function public.guard_online_booking_days_capacity()
returns trigger language plpgsql security invoker set search_path='' as $$
declare appointment date:=coalesce(new.confirmed_date,new.preferred_date_1);slot jsonb;
begin
 if new.source is distinct from 'Website booking' or new.status is distinct from 'awaiting_review' then return new;end if;
 -- A retry keeps its original receipt, including older requests.
 if exists(select 1 from public.website_booking_requests where id=new.id) then return new;end if;
 perform pg_advisory_xact_lock(214765,appointment-date '2000-01-01');
 if exists(select 1 from public.website_booking_requests where id=new.id) then return new;end if;
 slot:=public.vecta_online_booking_slot(appointment,new.job_types);
 if slot is null then raise exception 'VECTA_BOOKING_UNAVAILABLE: Choose another available date';end if;
 if new.confirmed_time is not null and new.confirmed_time<>(slot->>'time')::time then
  raise exception 'VECTA_BOOKING_UNAVAILABLE: This time is no longer available';
 end if;
 new.confirmed_time:=(slot->>'time')::time;
 return new;
end;$$;
drop trigger if exists guard_online_booking_days_capacity on public.website_booking_requests;
create trigger guard_online_booking_days_capacity before insert on public.website_booking_requests for each row execute function public.guard_online_booking_days_capacity();
revoke all on function public.vecta_booking_earliest(jsonb,timestamptz),public.vecta_online_booking_slot(date,jsonb,timestamptz),public.vecta_online_booking_availability(jsonb),public.guard_online_booking_days_capacity() from public,anon,authenticated;
grant execute on function public.vecta_booking_earliest(jsonb,timestamptz),public.vecta_online_booking_slot(date,jsonb,timestamptz),public.vecta_online_booking_availability(jsonb),public.guard_online_booking_days_capacity() to service_role;
