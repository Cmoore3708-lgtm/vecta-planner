-- New website requests reserve one hour as an actual grey planner job.
-- Existing requests/jobs are deliberately left intact.
set local lock_timeout = '5s';
create or replace function public.vecta_online_booking_slot(p_date date,p_types jsonb,p_now timestamptz default now())
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 busy boolean[]:=array_fill(false,array[480]); start_min integer;end_min integer;i integer;s integer;
 dur integer:=60; -- A review hold is one hour; confirmed jobs use their edited duration.
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
 for r in select confirmed_time,job_types,reserved_hours from public.website_booking_requests b
  where coalesce(confirmed_date,preferred_date_1)=p_date and status in ('awaiting_review','contacted') and source='Website booking'
  -- A linked planner job owns the reservation, even after moving/cancelling it.
  and not exists(select 1 from public.jobs j where j.id=b.job_id)
  order by (confirmed_time is null),created_at,id loop
  pending_duration:=ceil(coalesce(r.reserved_hours,public.website_booking_duration_hours(r.job_types))*2)::integer*30;
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
 return jsonb_build_object('slots',slots,'earliest_date',first_date,'hours',1,
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
 new.reserved_hours:=1;
 return new;
end;$$;


-- The admission lock is still held here. The request and its provisional job
-- commit together, including photo submissions and retries. AFTER INSERT means
-- ON CONFLICT retries never create an orphan job.
create or replace function public.vecta_create_website_provisional()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_job_id uuid; note text; parts_hex text; encoded_parts text; details_hex text; encoded_details text; types text;
begin
 if new.source is distinct from 'Website booking' or new.status is distinct from 'awaiting_review' then return new;end if;
 if new.job_id is not null then raise exception 'A new website request cannot select an existing job';end if;
 select string_agg(case when value ~* '^(service|major service)$' then 'Full Service' else value end,' || ' order by ord)
 into types from jsonb_array_elements_text(new.job_types) with ordinality as x(value,ord);
 note:='Website request ID: '||new.id::text||' || Website booking made: '||new.created_at::text||
  ' || Website requested date: '||new.preferred_date_1::text||' || Website customer notes: '||new.work_required||
  ' || Completion deadline: '||coalesce(new.completion_deadline,'Not provided')||' || Contact preference: '||coalesce(new.contact_preference,'Email');
 -- Use the application's existing URI-encoded parts format, preserving UTF-8.
 if jsonb_typeof(new.gsf_parts)='array' and jsonb_array_length(new.gsf_parts)>0 then
  parts_hex:=encode(convert_to(new.gsf_parts::text,'UTF8'),'hex');
  select string_agg('%'||substr(parts_hex,n,2),'' order by n) into encoded_parts from generate_series(1,length(parts_hex),2) n;
  note:=note||E'\n[[JOB_PARTS_URI:'||encoded_parts||']]';
 end if;
 details_hex:=encode(convert_to(jsonb_build_object('customer_account','Staff','mileage',new.mileage)::text,'UTF8'),'hex');
 select string_agg('%'||substr(details_hex,n,2),'' order by n) into encoded_details from generate_series(1,length(details_hex),2) n;
 note:=note||E'\n[[VECTA_WEB_DETAILS:'||encoded_details||']]';
 insert into public.jobs(booking_date,drop_time,registration,vehicle,work_required,customer_name,customer_phone,customer_email,
   customer_note,technician,ramp,status,job_type,job_colour,estimated_hours,source,card_type,archived,mot_due)
 values(coalesce(new.confirmed_date,new.preferred_date_1),new.confirmed_time,new.registration,new.vehicle,new.work_required,
   new.customer_name,new.phone,new.email,note,'Alfie','','provisional',coalesce(types,'General'),split_part(coalesce(types,'General'),' || ',1),
   1,'website booking','job',false,new.mot_due) returning id into v_job_id;
 update public.website_booking_requests set job_id=v_job_id where id=new.id;
 return new;
end;$$;

-- Keep the inbox and planner in one transaction. There is only one capacity
-- owner: the linked job. Confirmation never creates a second job.
create or replace function public.vecta_sync_website_provisional_job()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if position('[[VECTA_WEB_DETAILS:' in coalesce(new.customer_note,''))=0 then return new;end if;
 if new.status='provisional' and not coalesce(new.archived,false) then
  update public.website_booking_requests set confirmed_date=new.booking_date,confirmed_time=new.drop_time,reserved_hours=new.estimated_hours
   where job_id=new.id and status in ('awaiting_review','contacted')
   and (confirmed_date,confirmed_time,reserved_hours) is distinct from (new.booking_date,new.drop_time,new.estimated_hours);
 elsif new.status in ('booked','in_progress','work_complete','ready_to_invoice','completed') then
  update public.website_booking_requests set status='booked',confirmed_at=coalesce(confirmed_at,now()),
   confirmed_date=new.booking_date,confirmed_time=new.drop_time,reserved_hours=new.estimated_hours
   where job_id=new.id and status in ('awaiting_review','contacted');
 elsif coalesce(new.archived,false) or new.status in ('cancelled','deleted') then
  update public.website_booking_requests set status='cancelled' where job_id=new.id and status in ('awaiting_review','contacted');
 end if;
 return new;
end;$$;

create or replace function public.vecta_cancel_website_provisional_request()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is not distinct from old.status then return new;end if;
 if new.status in ('archived','declined','deleted','cancelled') then
  -- Retain history. Confirmed work and its invoices are never removed here.
  update public.jobs set status='cancelled',archived=true where id=new.job_id and status='provisional' and not coalesce(archived,false)
   and position('[[VECTA_WEB_DETAILS:' in coalesce(customer_note,''))>0;
 end if;
 return new;
end;$$;

-- Retire legacy hard-delete hooks if present on an older installation.
drop trigger if exists trg_vecta_website_booking_delete_job_on_row_delete on public.website_booking_requests;
drop trigger if exists trg_vecta_website_booking_delete_job_on_status on public.website_booking_requests;
create trigger vecta_create_website_provisional after insert on public.website_booking_requests
 for each row execute function public.vecta_create_website_provisional();
create trigger vecta_sync_website_provisional_job after update of status,archived,booking_date,drop_time,estimated_hours on public.jobs
 for each row execute function public.vecta_sync_website_provisional_job();
create trigger vecta_cancel_website_provisional_request after update of status on public.website_booking_requests
 for each row execute function public.vecta_cancel_website_provisional_request();
revoke all on function public.vecta_create_website_provisional(),public.vecta_sync_website_provisional_job(),public.vecta_cancel_website_provisional_request() from public,anon,authenticated;
grant execute on function public.vecta_create_website_provisional(),public.vecta_sync_website_provisional_job(),public.vecta_cancel_website_provisional_request() to service_role;

-- Photo submissions must retain the same parts snapshot as ordinary requests.
create or replace function public.insert_website_booking_with_photos(p_request jsonb,p_photos jsonb)
returns setof public.website_booking_requests
language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved public.website_booking_requests;
begin
 if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 3 then
  raise exception 'Invalid booking photos';
 end if;
 insert into public.website_booking_requests
 (id,customer_name,email,phone,registration,vehicle,mileage,mot_due,job_types,work_required,preferred_date_1,preferred_date_2,preferred_date_3,completion_deadline,contact_preference,source,status,confirmed_date,confirmed_time,approximate_cost,created_at,work_photo_count,gsf_parts)
 select id,customer_name,email,phone,registration,vehicle,mileage,mot_due,job_types,work_required,preferred_date_1,preferred_date_2,preferred_date_3,completion_deadline,contact_preference,source,status,confirmed_date,confirmed_time,approximate_cost,created_at,jsonb_array_length(p_photos),gsf_parts
 from jsonb_populate_record(null::public.website_booking_requests,p_request)
 on conflict(id) do nothing returning * into saved;
 if found then
  insert into public.website_booking_photos(request_id,photos) values(saved.id,p_photos);
  return next saved;
 end if;
 return;
end;
$$;
revoke all on function public.insert_website_booking_with_photos(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.insert_website_booking_with_photos(jsonb,jsonb) to service_role;
