-- Vecta Planner 2.0 safe schema
-- Run this in Supabase SQL Editor. It only creates tables/columns if missing.

create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  department text,
  created_at timestamptz default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  registration text not null,
  make text,
  model text,
  mileage integer,
  mot_due date,
  tax_due date,
  created_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'booked',
  booked_date date not null default current_date,
  start_time time,
  end_time time,
  technician text,
  price numeric(10,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  title text not null,
  completed boolean default false,
  created_at timestamptz default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  note text not null,
  created_at timestamptz default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  invoice_number text,
  status text default 'draft',
  total numeric(10,2) default 0,
  created_at timestamptz default now()
);

create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) default 1,
  unit_price numeric(10,2) default 0,
  total numeric(10,2) generated always as (quantity * unit_price) stored
);

create table if not exists workshop_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb,
  updated_at timestamptz default now()
);

-- Keep RLS off for initial private garage deployment until auth is added.
alter table customers disable row level security;
alter table vehicles disable row level security;
alter table jobs disable row level security;
alter table tasks disable row level security;
alter table notes disable row level security;
alter table invoices disable row level security;
alter table invoice_lines disable row level security;
alter table workshop_settings disable row level security;
