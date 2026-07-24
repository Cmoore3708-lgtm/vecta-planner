-- Run once in Supabase SQL Editor so completion dates and quoted ex-VAT values
-- sync between every device. The app remains usable before this is run, but
-- those two new fields will otherwise only be available in browser-local data.
alter table public.jobs add column if not exists completed_at timestamptz;
alter table public.jobs add column if not exists quoted_amount_ex_vat numeric(12,2) default 0;

update public.jobs
set completed_at = coalesce(completed_at, updated_at, booking_date::timestamptz, created_at)
where (status = 'completed' or archived = true) and completed_at is null;
