-- Customer-owned preference, separate from MOT/tax data replaced by refreshes.
-- NULL means unanswered; never infer "No" for an existing vehicle.
alter table public.customer_garage_vehicles
 add column nevos_vehicle text check (nevos_vehicle in ('yes','no'));
comment on column public.customer_garage_vehicles.nevos_vehicle is
 'Explicit NEVOS answer saved by the verified garage account. NULL is unknown.';
-- Existing RLS and service-only grants remain unchanged.
