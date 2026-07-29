-- Vecta Workshop Pro: month-end invoicing completion date
-- Run once in Supabase SQL Editor. The app still falls back to updated_at / booking_date
-- until this column exists.

alter table public.jobs
  add column if not exists completed_at timestamptz;

update public.jobs
set completed_at = coalesce(completed_at, updated_at, booking_date::timestamptz, created_at)
where (status = 'completed' or archived = true)
  and completed_at is null;

create index if not exists jobs_completed_at_idx on public.jobs (completed_at);
