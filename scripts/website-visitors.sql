-- Daily unique website visitors. Apply to isolated Test, then Main on release.
-- Service role only; no raw IPs, browser strings, registration or customer data.
create table if not exists public.website_visitor_days (
  visit_day date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  primary key (visit_day, visitor_hash)
);
create table if not exists public.website_visitor_tracking (
  id boolean primary key default true check (id),
  started_at timestamptz not null default now()
);
alter table public.website_visitor_days enable row level security;
alter table public.website_visitor_tracking enable row level security;
revoke all on public.website_visitor_days, public.website_visitor_tracking from public, anon, authenticated;
grant select, insert, delete on public.website_visitor_days to service_role;
grant select, insert on public.website_visitor_tracking to service_role;

create or replace function public.record_website_visit(p_day date, p_hash text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_day is distinct from (now() at time zone 'Europe/London')::date
    or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor record';
  end if;
  insert into public.website_visitor_tracking(id) values (true) on conflict do nothing;
  insert into public.website_visitor_days(visit_day, visitor_hash) values (p_day, p_hash) on conflict do nothing;
  -- Retain only the two calendar days needed for this display.
  delete from public.website_visitor_days where visit_day < p_day - 1;
end;
$$;

create or replace function public.website_visitor_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with period as (select (now() at time zone 'Europe/London')::date as today),
  tracking as (select min(started_at) as started from public.website_visitor_tracking)
  select jsonb_build_object(
    'date', today, 'timezone', 'Europe/London', 'started_at', started,
    'today', case when started is not null then (select count(*) from public.website_visitor_days where visit_day = today) else null end,
    'yesterday', case when (started at time zone 'Europe/London')::date <= today - 1 then (select count(*) from public.website_visitor_days where visit_day = today - 1) else null end,
    'partial_today', (started at time zone 'Europe/London')::date = today,
    'partial_yesterday', (started at time zone 'Europe/London')::date = today - 1
  ) from period cross join tracking;
$$;
revoke all on function public.record_website_visit(date, text), public.website_visitor_summary() from public, anon, authenticated;
grant execute on function public.record_website_visit(date, text), public.website_visitor_summary() to service_role;
