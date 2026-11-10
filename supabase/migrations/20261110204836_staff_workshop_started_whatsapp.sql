-- Only future transitions create an intent. No scan/backfill of existing jobs.
-- A unique job key prevents reopening a job from sending a second arrival.
create table public.staff_workshop_start_alerts (
 job_id uuid primary key references public.jobs(id) on delete cascade,
 registration text not null, customer_email text not null, customer_phone text not null,
 booking_date date not null, created_at timestamptz not null default clock_timestamp(),
 status text not null default 'queued', attempts integer not null default 0 check(attempts>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_id uuid, lease_until timestamptz,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.staff_workshop_start_alerts enable row level security;
revoke all on public.staff_workshop_start_alerts from public,anon,authenticated;
grant select,insert,update on public.staff_workshop_start_alerts to service_role;
create index staff_workshop_start_retry_idx on public.staff_workshop_start_alerts(next_attempt_at)
 where status in ('queued','waiting_image','failed','unavailable');

create function public.vecta_queue_staff_workshop_start() returns trigger
language plpgsql security definer set search_path='' as $$
declare account text; j jsonb:=to_jsonb(new);
begin
 if new.status='in_progress' and old.status in ('booked','arrived')
  and new.booking_date=(clock_timestamp() at time zone 'Europe/London')::date
  and not coalesce(new.archived,false)
  and coalesce(j->>'card_type','job') in ('','job')
  and coalesce(j->>'no_vehicle','false')<>'true'
  and coalesce(j->>'deleted','false')<>'true' and nullif(j->>'deleted_at','') is null
  and coalesce(j->>'customer_note','') !~* '\[\[VECTA_(SOFT_DELETE|DELETED)[:\]]'
  and coalesce(j->>'job_type','') !~* 'vehicle tax|pool car tax'
  and regexp_replace(upper(coalesce(new.registration,'')),'[^A-Z0-9]','','g')<>'' then
  select value->>'customer_account' into account from public.workshop_settings where id='jobcustomer:'||new.id::text;
  account:=upper(trim(coalesce(nullif(account,''),j->>'customer_account','')));
  if account='STAFF' then
   insert into public.staff_workshop_start_alerts(job_id,registration,customer_email,customer_phone,booking_date)
   values(new.id,regexp_replace(upper(new.registration),'[^A-Z0-9]','','g'),lower(trim(coalesce(new.customer_email,''))),coalesce(new.customer_phone,''),new.booking_date)
   on conflict(job_id) do nothing;
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.vecta_queue_staff_workshop_start() from public,anon,authenticated;
create trigger vecta_queue_staff_workshop_start after update of status on public.jobs
 for each row execute function public.vecta_queue_staff_workshop_start();
notify pgrst,'reload schema';
