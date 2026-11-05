-- Phase 2: private 90-day daily history and verified online-booking attribution.
-- Apply after website-visitors.sql. Existing totals remain valid; no history is invented.
alter table public.website_visitor_days add column if not exists browsed boolean not null default false;
alter table public.website_visitor_tracking add column if not exists activity_started_at timestamptz not null default now();
create table if not exists public.website_visitor_bookings (
  request_id uuid primary key references public.website_booking_requests(id) on delete cascade,
  visit_day date not null,
  visitor_hash text not null,
  foreign key (visit_day, visitor_hash) references public.website_visitor_days(visit_day, visitor_hash) on delete cascade
);
create index if not exists website_visitor_bookings_day_hash on public.website_visitor_bookings(visit_day, visitor_hash);
alter table public.website_visitor_bookings enable row level security;
revoke all on public.website_visitor_bookings from public, anon, authenticated;
grant select, insert, delete on public.website_visitor_bookings to service_role;
grant update(browsed) on public.website_visitor_days to service_role;

-- Keep the original collector compatible during rolling deployments.
create or replace function public.record_website_visit(p_day date, p_hash text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_day is distinct from (now() at time zone 'Europe/London')::date
    or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid visitor record'; end if;
  insert into public.website_visitor_tracking(id) values (true) on conflict do nothing;
  insert into public.website_visitor_days(visit_day, visitor_hash) values (p_day, p_hash) on conflict do nothing;
  delete from public.website_visitor_days where visit_day < p_day - 89;
end;
$$;

create or replace function public.record_website_activity(p_day date, p_hash text, p_kind text, p_request uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'Europe/London')::date;
begin
  if p_day is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_kind is null or p_kind not in ('browse','progress','booking')
    or (p_kind <> 'booking' and p_day <> today)
    or (p_kind = 'booking' and (p_day not between today - 1 and today or p_request is null)) then
    raise exception 'Invalid website activity';
  end if;
  if p_kind = 'booking' and not exists (
    select 1 from public.website_booking_requests r where r.id = p_request
    and (r.created_at at time zone 'Europe/London')::date = p_day
    and r.created_at >= now() - interval '15 minutes'
    and r.source = 'Website booking'
  ) then raise exception 'Booking receipt not found'; end if;
  insert into public.website_visitor_tracking(id) values (true) on conflict do nothing;
  insert into public.website_visitor_days(visit_day,visitor_hash,browsed) values (p_day,p_hash,p_kind <> 'progress')
    on conflict (visit_day,visitor_hash) do update set browsed = public.website_visitor_days.browsed or excluded.browsed;
  if p_kind = 'booking' then
    insert into public.website_visitor_bookings(request_id,visit_day,visitor_hash) values(p_request,p_day,p_hash) on conflict do nothing;
  end if;
  delete from public.website_visitor_days where visit_day < today - 89;
end;
$$;

create or replace function public.website_visitor_history(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path = '' as $$
 with config as (
   select (now() at time zone 'Europe/London')::date today, case when p_days = 30 then 30 else 7 end days
 ), tracking as (
   select min(started_at) started, min(activity_started_at) activity_started from public.website_visitor_tracking
 ), dates as (
   select (today - n)::date as day from config cross join lateral generate_series(0, days - 1) n
 ), visits as (
   select visit_day, count(*) visitors, count(*) filter (where browsed) booking_visitors
   from public.website_visitor_days, config where visit_day between today - days + 1 and today group by visit_day
 ), bookings as (
   select b.visit_day,
     count(*) filter (where r.status in ('awaiting_review','contacted','booked')) requests,
     count(*) filter (where r.status = 'booked' and r.job_id is not null) confirmed,
     count(distinct b.visitor_hash) filter (where r.status = 'booked' and r.job_id is not null) converted_visitors
   from public.website_visitor_bookings b join public.website_booking_requests r on r.id = b.request_id, config
   where b.visit_day between today - days + 1 and today group by b.visit_day
 )
 select jsonb_build_object('date', today, 'timezone','Europe/London', 'started_at',started,'activity_started_at',activity_started,
   'days',(select jsonb_agg(jsonb_build_object(
     'date',d.day,
     'visitors',case when d.day >= greatest((started at time zone 'Europe/London')::date, (activity_started at time zone 'Europe/London')::date - 1) and started is not null then coalesce(v.visitors,0) else null end,
     'booking_visitors',case when d.day >= (activity_started at time zone 'Europe/London')::date then coalesce(v.booking_visitors,0) else null end,
     'requests',case when d.day >= (activity_started at time zone 'Europe/London')::date then coalesce(b.requests,0) else null end,
     'confirmed',case when d.day >= (activity_started at time zone 'Europe/London')::date then coalesce(b.confirmed,0) else null end,
     'converted_visitors',case when d.day >= (activity_started at time zone 'Europe/London')::date then coalesce(b.converted_visitors,0) else null end,
     'partial',d.day = today or d.day = (started at time zone 'Europe/London')::date or d.day = (activity_started at time zone 'Europe/London')::date
   ) order by d.day) from dates d left join visits v on v.visit_day=d.day left join bookings b on b.visit_day=d.day)
 ) from config cross join tracking;
$$;
revoke all on function public.record_website_activity(date,text,text,uuid), public.website_visitor_history(integer) from public, anon, authenticated;
grant execute on function public.record_website_activity(date,text,text,uuid), public.website_visitor_history(integer) to service_role;
