-- Reading is not acknowledgement. Old clients may still write read_at;
-- these separate receipts keep a customer's message outstanding regardless.
-- Do not infer acknowledgement from historical reads or alter message/job data.
alter table public.customer_portal_events
 add column if not exists manager_acknowledged_at timestamptz,
 add column if not exists mechanic_acknowledged_at timestamptz;
