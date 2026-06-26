create extension if not exists pgcrypto;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  booking_date date,
  card_type text not null default 'job',
  registration text,
  vehicle text,
  work_required text,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_note text,
  drop_time time,
  technician text not null default 'Unallocated',
  ramp text,
  status text not null default 'booked',
  job_type text,
  estimated_hours numeric not null default 1,
  source text not null default 'manual',
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  task_text text not null,
  priority text not null default 'today',
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists jobs_booking_date_idx on jobs(booking_date);
create index if not exists jobs_registration_idx on jobs(registration);
create index if not exists jobs_status_idx on jobs(status);

alter table jobs enable row level security;
alter table tasks enable row level security;

drop policy if exists "authenticated can manage jobs" on jobs;
create policy "authenticated can manage jobs" on jobs for all to authenticated using (true) with check (true);

drop policy if exists "authenticated can manage tasks" on tasks;
create policy "authenticated can manage tasks" on tasks for all to authenticated using (true) with check (true);
