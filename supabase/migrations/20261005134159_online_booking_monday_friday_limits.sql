-- Online requests only: manual planner bookings and existing records are unchanged.
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

create or replace function public.guard_online_booking_days_capacity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
 appointment date := coalesce(new.confirmed_date,new.preferred_date_1);
 booked numeric;
 reserved numeric;
begin
 if new.source is distinct from 'Website booking' or new.status is distinct from 'awaiting_review' then return new; end if;
 -- A replay is a receipt lookup, including requests made before this policy.
 if exists(select 1 from public.website_booking_requests where id=new.id) then return new; end if;
 if extract(isodow from appointment)=1 then
  raise exception 'VECTA_BOOKING_MONDAY: Mondays are unavailable online';
 end if;
 if extract(isodow from appointment)<>5 then return new; end if;
 -- Serialize Friday admissions so simultaneous requests cannot claim the same capacity.
 perform pg_advisory_xact_lock(214765,appointment-date '2000-01-01');
 if exists(select 1 from public.website_booking_requests where id=new.id) then return new; end if;
 select coalesce(sum(ceil(coalesce(nullif(estimated_hours,0),1)*2)/2),0) into booked
 from public.jobs where booking_date=appointment and technician='Alfie' and archived=false
 and lower(coalesce(status,'')) not in ('completed','cancelled','deleted','quote');
 select coalesce(sum(public.website_booking_duration_hours(job_types)),0) into reserved
 from public.website_booking_requests where confirmed_date=appointment and status='awaiting_review';
 if booked+reserved+public.website_booking_duration_hours(new.job_types)>4 then
  raise exception 'VECTA_BOOKING_FRIDAY_CAPACITY: Friday online capacity for Alfie is full';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_online_booking_days_capacity() from public, anon, authenticated;
grant execute on function public.guard_online_booking_days_capacity() to service_role;

drop trigger if exists guard_online_booking_days_capacity on public.website_booking_requests;
create trigger guard_online_booking_days_capacity before insert on public.website_booking_requests
for each row execute function public.guard_online_booking_days_capacity();
