-- Record acceptance in the same transaction as the planner's status change.
create or replace function public.vecta_customer_booking_confirmed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.customer_portal_events
    (job_id,request_id,registration,customer_email,kind,actor,message,dedupe_key)
  select j.id,new.id,regexp_replace(upper(j.registration),'[^A-Z0-9]','','g'),
    lower(trim(j.customer_email)),'booking_confirmed','workshop',
    'Good news, your booking is confirmed!', 'booking-confirmed:' || new.id
  from public.jobs j
  where j.id=new.job_id and not coalesce(j.archived,false)
    and lower(trim(j.customer_email))=lower(trim(new.email))
    and regexp_replace(upper(j.registration),'[^A-Z0-9]','','g')=regexp_replace(upper(new.registration),'[^A-Z0-9]','','g')
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function public.vecta_customer_booking_confirmed() from public,anon,authenticated;
create trigger vecta_customer_booking_confirmed after update of status,job_id on public.website_booking_requests
for each row when (new.status in ('booked','confirmed') and new.job_id is not null and
  (old.status is distinct from new.status or old.job_id is distinct from new.job_id))
execute function public.vecta_customer_booking_confirmed();
