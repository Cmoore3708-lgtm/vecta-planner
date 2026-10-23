-- Small, compressed booking photos stay separate from the planner's regular sync.
-- Only workshop-authenticated server routes can read these records.
create table if not exists public.website_booking_photos (
 request_id uuid primary key references public.website_booking_requests(id) on delete cascade,
 photos jsonb not null check (jsonb_typeof(photos)='array' and jsonb_array_length(photos) between 1 and 3 and octet_length(photos::text)<=1200200),
 created_at timestamptz not null default now()
);
alter table public.website_booking_photos enable row level security;
revoke all on public.website_booking_photos from public, anon, authenticated;
grant select, insert, delete on public.website_booking_photos to service_role;
alter table public.website_booking_requests add column if not exists work_photo_count integer not null default 0 check(work_photo_count between 0 and 3);

-- Preserve the existing request-only booking flow, atomically including its photos.
create or replace function public.insert_website_booking_with_photos(p_request jsonb,p_photos jsonb)
returns setof public.website_booking_requests
language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved public.website_booking_requests;
begin
 if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 3 then
  raise exception 'Invalid booking photos';
 end if;
 insert into public.website_booking_requests
 (id,customer_name,email,phone,registration,vehicle,mileage,mot_due,job_types,work_required,preferred_date_1,preferred_date_2,preferred_date_3,completion_deadline,contact_preference,source,status,confirmed_date,confirmed_time,approximate_cost,created_at,work_photo_count)
 select id,customer_name,email,phone,registration,vehicle,mileage,mot_due,job_types,work_required,preferred_date_1,preferred_date_2,preferred_date_3,completion_deadline,contact_preference,source,status,confirmed_date,confirmed_time,approximate_cost,created_at,jsonb_array_length(p_photos)
 from jsonb_populate_record(null::public.website_booking_requests,p_request)
 on conflict(id) do nothing returning * into saved;
 if found then
  insert into public.website_booking_photos(request_id,photos) values(saved.id,p_photos);
  return next saved;
 end if;
 return;
end;
$$;
revoke all on function public.insert_website_booking_with_photos(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.insert_website_booking_with_photos(jsonb,jsonb) to service_role;
