-- Jobs may legitimately leave the planner with a null booking date. Formatting
-- that null previously produced a null audit message and rolled back the save.
-- Preserve the private audit trail and its NOT NULL constraint.
create or replace function public.vecta_portal_job_audit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('vecta.portal_write',true)='1' then return new;end if;
 if coalesce(new.card_type,'job')<>'job' or coalesce(new.registration,'')='' then return new;end if;
 if new.booking_date is distinct from old.booking_date or new.work_required is distinct from old.work_required or new.status is distinct from old.status then
  insert into public.customer_portal_events(job_id,registration,customer_email,kind,actor,message,details)
  values(new.id,regexp_replace(upper(new.registration),'[^A-Z0-9]','','g'),lower(trim(coalesce(new.customer_email,''))),'booking_update','workshop',
   case
    when new.booking_date is distinct from old.booking_date and new.booking_date is not null
     then 'Booking date updated to '||to_char(new.booking_date,'DD/MM/YYYY')||'.'
    when new.status is distinct from old.status and new.booking_date is null then 'Workshop progress updated.'
    when new.booking_date is distinct from old.booking_date then 'Booking date cleared.'
    when new.work_required is distinct from old.work_required then 'Booked work updated.'
    else 'Workshop progress updated.'
   end,
   jsonb_build_object('booking_date',new.booking_date,'work_required',new.work_required,'status',new.status));
 end if;return new;
end;$$;
-- Definer access is needed only by the existing jobs trigger, never the API.
revoke all on function public.vecta_portal_job_audit() from public,anon,authenticated;
