-- Run once in Supabase SQL Editor before using the Fleet Manager bulk DVSA refresh.
-- The app includes a fallback for older schemas, but these columns preserve the full audit data.
alter table public.vehicles add column if not exists make text;
alter table public.vehicles add column if not exists model text;
alter table public.vehicles add column if not exists mot_due date;
alter table public.vehicles add column if not exists mot_status text;
alter table public.vehicles add column if not exists latest_mot_mileage text;
alter table public.vehicles add column if not exists mot_advisories jsonb not null default '[]'::jsonb;
alter table public.vehicles add column if not exists mot_history jsonb not null default '[]'::jsonb;
alter table public.vehicles add column if not exists dvsa_updated_at timestamptz;
create index if not exists vehicles_registration_normalised_idx on public.vehicles ((upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g'))));
