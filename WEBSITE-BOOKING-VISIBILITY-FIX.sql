-- Run this in Supabase SQL Editor so Workshop Pro can read and update website bookings.
alter table public.website_booking_requests enable row level security;

drop policy if exists "public can submit website booking" on public.website_booking_requests;
create policy "public can submit website booking"
on public.website_booking_requests for insert
to anon, authenticated
with check (true);

drop policy if exists "workshop can read website bookings" on public.website_booking_requests;
create policy "workshop can read website bookings"
on public.website_booking_requests for select
to anon, authenticated
using (true);

drop policy if exists "workshop can update website bookings" on public.website_booking_requests;
create policy "workshop can update website bookings"
on public.website_booking_requests for update
to anon, authenticated
using (true)
with check (true);
