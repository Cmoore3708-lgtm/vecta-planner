-- Additive upgrade: old clients continue to work. Read receipts never accept a
-- booking, modify a job, or clear future messages. Existing RLS/grants remain.
alter table public.customer_portal_events
 add column if not exists manager_read_at timestamptz,
 add column if not exists mechanic_read_at timestamptz;
alter table public.website_booking_requests
 add column if not exists reviewed_at timestamptz;
