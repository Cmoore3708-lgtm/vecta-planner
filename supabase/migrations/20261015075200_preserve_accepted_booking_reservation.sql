-- Keep the accepted planner job at its reserved time and duration.
alter table public.website_booking_requests add column if not exists reserved_hours numeric;
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
 new.reserved_hours:=public.website_booking_duration_hours(new.job_types);
 return new;
end;$$;

