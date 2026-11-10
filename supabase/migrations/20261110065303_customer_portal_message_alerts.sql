-- Save alert intent in the same transaction as each new workshop message.
-- Approval requests already have their own two-channel delivery ledger. Do not
-- notify on correspondence/audit events: that would alert again about the alert.
create table public.customer_portal_alerts (
 event_id uuid primary key references public.customer_portal_events(id),
 job_id uuid not null references public.jobs(id),
 registration text not null, customer_email text not null, customer_phone text not null,
 customer_name text not null, booking_date date not null,
 created_at timestamptz not null default clock_timestamp(),
 email_status text not null default 'queued', whatsapp_status text not null default 'queued',
 attempts integer not null default 0 check(attempts>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_id uuid, lease_until timestamptz,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.customer_portal_alerts enable row level security;
revoke all on public.customer_portal_alerts from public,anon,authenticated;
grant select,insert,update on public.customer_portal_alerts to service_role;
create index customer_portal_alerts_job_idx on public.customer_portal_alerts(job_id,created_at);
create index customer_portal_alerts_retry_idx on public.customer_portal_alerts(next_attempt_at)
 where attempts<8 and (email_status in ('queued','failed','unavailable') or whatsapp_status in ('queued','failed','unavailable'));
create function public.vecta_queue_customer_portal_alert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.actor='workshop' and new.kind='message' and new.job_id is not null then
  insert into public.customer_portal_alerts(event_id,job_id,registration,customer_email,customer_phone,customer_name,booking_date,created_at)
  select new.id,j.id,new.registration,new.customer_email,coalesce(j.customer_phone,''),coalesce(j.customer_name,''),j.booking_date,new.created_at
  from public.jobs j where j.id=new.job_id
   and regexp_replace(upper(j.registration),'[^A-Z0-9]','','g')=new.registration
   and lower(trim(coalesce(j.customer_email,'')))=new.customer_email;
 end if;
 return new;
end;$$;
revoke all on function public.vecta_queue_customer_portal_alert() from public,anon,authenticated;
create trigger vecta_queue_customer_portal_alert after insert on public.customer_portal_events
 for each row execute function public.vecta_queue_customer_portal_alert();
notify pgrst,'reload schema';
