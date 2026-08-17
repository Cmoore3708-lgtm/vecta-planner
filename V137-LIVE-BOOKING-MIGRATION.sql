-- VECTA v137: live appointment booking + secure additional-work approvals
-- Run once in Supabase SQL Editor.

-- Optional workshop time-off records used by the public availability engine.
create table if not exists public.mechanic_time_off (
  id uuid primary key default gen_random_uuid(),
  mechanic text not null,
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.mechanic_time_off enable row level security;
-- Do not add public/anon read policies. The API will use SUPABASE_SERVICE_ROLE_KEY when available.

create table if not exists public.additional_work_approvals (
  id uuid primary key,
  token text not null unique,
  job_id uuid not null,
  registration text,
  vehicle text,
  customer_name text,
  customer_email text,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  decided_at timestamptz
);
alter table public.additional_work_approvals enable row level security;
-- Intentionally no anon policies: approval data is only accessed through server-side API routes.

-- The live-booking API uses these existing tables:
-- jobs, customers, vehicles, website_booking_requests.
-- No destructive schema changes are required.
