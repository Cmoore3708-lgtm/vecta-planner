create extension if not exists pgcrypto;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  booking_date date,
  card_type text not null default 'job',
  registration text,
  vehicle text,
  tax_status text,
  tax_due date,
  mot_due date,
  year text,
  fuel_type text,
  engine_size text,
  model text,
  make text,
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
  job_colour text,
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

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  note_text text not null,
  created_at timestamptz not null default now()
);

alter table jobs enable row level security;
alter table tasks enable row level security;
alter table notes enable row level security;

drop policy if exists "anon can manage jobs" on jobs;
create policy "anon can manage jobs" on jobs for all to anon using (true) with check (true);

drop policy if exists "anon can manage tasks" on tasks;
create policy "anon can manage tasks" on tasks for all to anon using (true) with check (true);

drop policy if exists "anon can manage notes" on notes;
create policy "anon can manage notes" on notes for all to anon using (true) with check (true);


create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  surname text,
  name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  registration text unique,
  customer_id uuid references customers(id),
  vehicle text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists service_reminders (
  id uuid primary key default gen_random_uuid(),
  registration text,
  reminder_date date,
  reminder_type text not null default 'service',
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table customers enable row level security;
alter table vehicles enable row level security;
alter table service_reminders enable row level security;

drop policy if exists "anon can manage customers" on customers;
create policy "anon can manage customers" on customers for all to anon using (true) with check (true);

drop policy if exists "anon can manage vehicles" on vehicles;
create policy "anon can manage vehicles" on vehicles for all to anon using (true) with check (true);

drop policy if exists "anon can manage reminders" on service_reminders;
create policy "anon can manage reminders" on service_reminders for all to anon using (true) with check (true);


create table if not exists workshop_settings (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table workshop_settings enable row level security;

drop policy if exists "anon can manage workshop settings" on workshop_settings;
create policy "anon can manage workshop settings" on workshop_settings for all to anon using (true) with check (true);


create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  registration text,
  invoice_number text,
  amount numeric,
  invoice_date date,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

alter table invoices enable row level security;

drop policy if exists "anon can manage invoices" on invoices;
create policy "anon can manage invoices" on invoices for all to anon using (true) with check (true);


create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid,
  type text,
  description text,
  qty numeric,
  unit_price numeric,
  created_at timestamptz not null default now()
);

alter table invoice_lines enable row level security;

drop policy if exists "anon can manage invoice lines" on invoice_lines;
create policy "anon can manage invoice lines" on invoice_lines for all to anon using (true) with check (true);


create table if not exists mot_history (
  id uuid primary key default gen_random_uuid(),
  registration text,
  test_date date,
  expiry_date date,
  result text,
  mileage integer,
  advisories text,
  failures text,
  created_at timestamptz not null default now()
);

alter table mot_history enable row level security;

drop policy if exists "anon can manage mot history" on mot_history;
create policy "anon can manage mot history" on mot_history for all to anon using (true) with check (true);

-- Shared service sheet records (added 22 July 2026)
create table if not exists service_records (
  id uuid primary key default gen_random_uuid(),
  registration text not null,
  html text not null,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_records_registration_idx on service_records (registration);

alter table service_records enable row level security;

drop policy if exists "anon can manage service records" on service_records;
create policy "anon can manage service records" on service_records for all to anon using (true) with check (true);
