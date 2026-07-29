-- Run once in Supabase SQL Editor before publishing the new booking page.
create table if not exists public.website_booking_requests (
  id uuid primary key,
  created_at timestamptz not null default now(),
  customer_name text not null,
  email text not null,
  phone text not null,
  registration text not null,
  vehicle text not null,
  mileage text,
  job_types jsonb not null default '[]'::jsonb,
  work_required text not null,
  preferred_date_1 date not null,
  preferred_date_2 date,
  preferred_date_3 date,
  completion_deadline text,
  contact_preference text default 'Email',
  source text default 'Website booking',
  status text not null default 'awaiting_review',
  confirmed_date date,
  confirmed_at timestamptz,
  approximate_cost numeric(10,2),
  job_id uuid
);

alter table public.website_booking_requests enable row level security;

-- Public website visitors may submit a request, but cannot read any requests.
drop policy if exists "public can submit website booking" on public.website_booking_requests;
create policy "public can submit website booking"
on public.website_booking_requests for insert
to anon
with check (status = 'awaiting_review');

-- Workshop Pro currently uses the anon client. This policy allows its interface
-- to review and confirm requests. Replace with authenticated-user policies when login is added.
drop policy if exists "workshop can manage website bookings" on public.website_booking_requests;
create policy "workshop can manage website bookings"
on public.website_booking_requests for all
to authenticated
using (true) with check (true);

-- Temporary compatibility for the current Workshop Pro deployment without authentication.
-- Keep only while the app is privately protected; remove after staff login is implemented.
drop policy if exists "temporary workshop anon read update" on public.website_booking_requests;
create policy "temporary workshop anon read update"
on public.website_booking_requests for select
to anon using (true);
drop policy if exists "temporary workshop anon update" on public.website_booking_requests;
create policy "temporary workshop anon update"
on public.website_booking_requests for update
to anon using (true) with check (true);

alter table public.website_booking_requests replica identity full;
alter publication supabase_realtime add table public.website_booking_requests;
