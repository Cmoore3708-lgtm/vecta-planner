-- Private, append-only conversation. Only the signed-link / workshop API can read it.
create table public.customer_portal_events (
 id uuid primary key default gen_random_uuid(),
 seq bigint generated always as identity unique,
 job_id uuid references public.jobs(id), request_id uuid references public.website_booking_requests(id),
 registration text not null, customer_email text not null,
 kind text not null, actor text not null check(actor in ('customer','workshop','system')),
 message text not null check(length(message)<=30000), details jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp(),
 manager_alert boolean not null default false, mechanic_at timestamptz,
 mechanic_message text, dedupe_key text unique,
 check(job_id is not null or request_id is not null)
);
alter table public.customer_portal_events enable row level security;
revoke all on public.customer_portal_events from public,anon,authenticated;
grant select,insert,update on public.customer_portal_events to service_role;
grant usage,select on sequence public.customer_portal_events_seq_seq to service_role;
create index customer_portal_job_idx on public.customer_portal_events(job_id,seq);
create index customer_portal_request_idx on public.customer_portal_events(request_id,seq);
create index customer_portal_alert_idx on public.customer_portal_events(seq) where manager_alert or mechanic_at is not null;

alter table public.jobs add column portal_original jsonb;
alter table public.website_booking_requests add column portal_original jsonb;
-- Snapshot booking contents before further edits. Legacy rows use the oldest
-- available website request; no invented historical creation date is introduced.
update public.website_booking_requests set portal_original=jsonb_build_object('created_at',created_at,'booking_date',coalesce(confirmed_date,preferred_date_1),'work_required',work_required,'legacy',true);
update public.jobs j set portal_original=coalesce((select r.portal_original from public.website_booking_requests r where r.job_id=j.id order by r.created_at limit 1),jsonb_build_object('created_at',j.created_at,'booking_date',j.booking_date,'work_required',j.work_required,'legacy',true));
create function public.vecta_freeze_portal_original() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then new.portal_original:=old.portal_original;
 elsif tg_table_name='jobs' then new.portal_original:=jsonb_build_object('created_at',new.created_at,'booking_date',new.booking_date,'work_required',new.work_required);
 else new.portal_original:=jsonb_build_object('created_at',new.created_at,'booking_date',coalesce(new.confirmed_date,new.preferred_date_1),'work_required',new.work_required);
 end if;return new;
end;$$;
create trigger vecta_freeze_portal_original before insert or update on public.jobs for each row execute function public.vecta_freeze_portal_original();
create trigger vecta_freeze_portal_original before insert or update on public.website_booking_requests for each row execute function public.vecta_freeze_portal_original();
revoke all on function public.vecta_freeze_portal_original() from public,anon,authenticated;

-- A trigger needs definer access because normal workshop saves cannot write
-- the private audit table. This function is never callable through the API.
create function public.vecta_portal_job_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('vecta.portal_write',true)='1' then return new;end if;
 if coalesce(new.card_type,'job')<>'job' or coalesce(new.registration,'')='' then return new;end if;
 if new.booking_date is distinct from old.booking_date or new.work_required is distinct from old.work_required or new.status is distinct from old.status then
  insert into public.customer_portal_events(job_id,registration,customer_email,kind,actor,message,details)
  values(new.id,regexp_replace(upper(new.registration),'[^A-Z0-9]','','g'),lower(trim(coalesce(new.customer_email,''))),'booking_update','workshop',
   case when new.booking_date is distinct from old.booking_date then 'Booking date updated to '||to_char(new.booking_date,'DD/MM/YYYY')||'.' when new.work_required is distinct from old.work_required then 'Booked work updated.' else 'Workshop progress updated.' end,
   jsonb_build_object('booking_date',new.booking_date,'work_required',new.work_required,'status',new.status));
 end if;return new;
end;$$;
revoke all on function public.vecta_portal_job_audit() from public,anon,authenticated;
create trigger vecta_portal_job_audit after update on public.jobs for each row execute function public.vecta_portal_job_audit();

create function public.vecta_portal_approval_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; k text;
begin
 if new.progress_review_state<>'sent' or new.progress_message is null then return new;end if;
 if tg_op='UPDATE' and old.progress_review_state='sent' and old.status is not distinct from new.status then return new;end if;
 select * into j from public.jobs where id=new.job_id;
 if j.id is null then return new;end if;
 k:=case when new.status in ('approved','declined') then 'approval_response' else 'approval_request' end;
 insert into public.customer_portal_events(job_id,registration,customer_email,kind,actor,message,details,created_at,manager_alert,mechanic_at,dedupe_key)
 values(j.id,regexp_replace(upper(new.registration),'[^A-Z0-9]','','g'),lower(trim(coalesce(new.customer_email,''))),k,
  case when k='approval_response' then 'customer' else 'workshop' end,new.progress_message,
  jsonb_build_object('approval_id',new.id,'status',new.status,'estimated_pence',new.progress_estimate_pence),
  case when k='approval_response' then coalesce(new.decided_at,clock_timestamp()) else clock_timestamp() end,
  k='approval_response',case when new.status='approved' and new.progress_from_mechanic then clock_timestamp() end,
  'approval:'||new.id::text||':'||new.status) on conflict(dedupe_key) do nothing;
 return new;
end;$$;
revoke all on function public.vecta_portal_approval_audit() from public,anon,authenticated;
create trigger vecta_portal_approval_audit after insert or update on public.additional_work_approvals for each row execute function public.vecta_portal_approval_audit();
-- Preserve existing sent requests/decisions in chronological history too.
insert into public.customer_portal_events(job_id,registration,customer_email,kind,actor,message,details,created_at,dedupe_key)
select a.job_id,regexp_replace(upper(a.registration),'[^A-Z0-9]','','g'),lower(trim(coalesce(a.customer_email,''))),'approval_request','workshop',a.progress_message,
 jsonb_build_object('approval_id',a.id,'status','pending','estimated_pence',a.progress_estimate_pence),a.created_at,'approval:'||a.id::text||':pending'
from public.additional_work_approvals a join public.jobs j on j.id=a.job_id where a.progress_review_state='sent' and a.progress_message is not null on conflict(dedupe_key) do nothing;
insert into public.customer_portal_events(job_id,registration,customer_email,kind,actor,message,details,created_at,dedupe_key)
select a.job_id,regexp_replace(upper(a.registration),'[^A-Z0-9]','','g'),lower(trim(coalesce(a.customer_email,''))),'approval_response','customer',a.progress_message,
 jsonb_build_object('approval_id',a.id,'status',a.status,'estimated_pence',a.progress_estimate_pence),a.decided_at,'approval:'||a.id::text||':'||a.status
from public.additional_work_approvals a join public.jobs j on j.id=a.job_id where a.progress_review_state='sent' and a.status in ('approved','declined') and a.decided_at is not null on conflict(dedupe_key) do nothing;

-- Request lock precedes job lock, matching the booking acceptance transaction.
-- All actions, event history and cancellation commit together; retry IDs cannot
-- repeat an action or be repurposed for different text.
create function public.vecta_customer_portal_write(p_job_id uuid,p_request_id uuid,p_id uuid,p_actor text,p_kind text,p_message text,p_details jsonb,p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype; r public.website_booking_requests%rowtype; e public.customer_portal_events%rowtype;
 d date; t time; s text; reg text; mail text; prefs jsonb; note text; existing text;
begin
 if p_actor not in ('customer','workshop') or p_kind not in ('message','amendment','additional_work','cancelled','preferences') or p_id is null then raise exception 'Invalid portal action';end if;
 if p_request_id is not null then select * into r from public.website_booking_requests where id=p_request_id for update;
 else select * into r from public.website_booking_requests where job_id=p_job_id order by created_at limit 1 for update;end if;
 if p_request_id is not null and r.id is null then return jsonb_build_object('code',404,'error','Booking unavailable.');end if;
 if coalesce(r.job_id,p_job_id) is not null then select * into j from public.jobs where id=coalesce(r.job_id,p_job_id) for update;end if;
 if p_job_id is not null and j.id is distinct from p_job_id then return jsonb_build_object('code',409,'error','Booking changed. Refresh and try again.');end if;
 if j.id is null and r.id is null then return jsonb_build_object('code',404,'error','Booking unavailable.');end if;
 d:=coalesce(j.booking_date,r.confirmed_date,r.preferred_date_1);t:=coalesce(r.confirmed_time,j.drop_time,'08:00'::time);
 s:=coalesce(j.status,r.status);reg:=regexp_replace(upper(coalesce(j.registration,r.registration)),'[^A-Z0-9]','','g');mail:=lower(trim(coalesce(j.customer_email,r.email,'')));
 if reg is distinct from p_expected->>'registration' or mail is distinct from p_expected->>'email' or d::text is distinct from p_expected->>'booking_date' then return jsonb_build_object('code',409,'error','Booking changed. Refresh and try again.');end if;
 select * into e from public.customer_portal_events where id=p_id;
 if e.id is not null then
  if e.job_id is not distinct from j.id and e.request_id is not distinct from r.id and e.actor=p_actor and e.kind=p_kind and e.message=p_message and e.details=p_details then return jsonb_build_object('code',200,'event_id',e.id,'replayed',true);end if;
  return jsonb_build_object('code',409,'error','This message reference was already used. Refresh before sending.');
 end if;
 if s in ('cancelled','canceled','deleted','declined','rejected','archived','quote') or coalesce(j.card_type,'job')<>'job' or coalesce(j.customer_note,'') ~ '\[\[VECTA_(SOFT_DELETE|DELETED)' then return jsonb_build_object('code',409,'error','This booking is closed.');end if;
 if length(trim(p_message))=0 or length(p_message)>3000 then return jsonb_build_object('code',400,'error','Enter a message of up to 3,000 characters.');end if;
 if p_actor='customer' and p_kind in ('amendment','preferences') and d<=(clock_timestamp() at time zone 'Europe/London')::date then return jsonb_build_object('code',409,'error','Booking amendments close on the booking day. Send the workshop a message instead.');end if;
 if p_kind<>'message' and s in ('in_progress','work_complete','ready_to_invoice','completed','invoiced','invoice_created') then return jsonb_build_object('code',409,'error','Work has started or finished. Please message the workshop.');end if;
 perform set_config('vecta.portal_write','1',true);
 if p_kind='cancelled' then
  if p_actor<>'customer' or ((d+t) at time zone 'Europe/London')-clock_timestamp()<interval '24 hours' then return jsonb_build_object('code',409,'error','Online cancellation closes 24 hours before your booking. Please contact the workshop.');end if;
  if exists(select 1 from public.invoices where (job_id=j.id or fleet_job_ids @> jsonb_build_array(j.id::text)) and coalesce(status,'saved') not in ('draft','void','cancelled','deleted')) then return jsonb_build_object('code',409,'error','An invoice has been prepared. Please contact the workshop.');end if;
  if j.id is not null then update public.jobs set status='cancelled',archived=true,updated_at=clock_timestamp() where id=j.id;end if;
  if r.id is not null then update public.website_booking_requests set status='cancelled' where id=r.id;end if;
 elsif p_kind='preferences' then
  prefs:=p_details->'preferences';
  if prefs->>'version'<>'1' or coalesce(prefs->>'parts','') not in ('budget','mid_range','oem') or coalesce(prefs->>'serious_repairs','') not in ('change_parts','book_later') then return jsonb_build_object('code',400,'error','Choose valid booking preferences.');end if;
  if r.id is not null then update public.website_booking_requests set customer_preferences=prefs where id=r.id;end if;
  if j.id is not null then
   -- Use a plain JSON marker owned by this service; the browser preference
   -- reader checks it before the original website snapshot.
   note:=regexp_replace(coalesce(j.customer_note,''),E'\\n?\\[\\[VECTA_PORTAL_PREFERENCES:[^\\]]*\\]\\]','','g');
   update public.jobs set customer_note=note||E'\n[[VECTA_PORTAL_PREFERENCES:'||prefs::text||']]',updated_at=clock_timestamp() where id=j.id;
  end if;
 else
  if j.id is not null then update public.jobs set updated_at=clock_timestamp() where id=j.id;end if;
 end if;
 insert into public.customer_portal_events(id,job_id,request_id,registration,customer_email,kind,actor,message,details,manager_alert)
 values(p_id,j.id,r.id,reg,mail,p_kind,p_actor,trim(p_message),p_details,p_actor='customer');
 return jsonb_build_object('code',200,'event_id',p_id,'cancelled',p_kind='cancelled');
end;$$;
revoke all on function public.vecta_customer_portal_write(uuid,uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_customer_portal_write(uuid,uuid,uuid,text,text,text,jsonb,jsonb) to service_role;

create function public.vecta_forward_portal_event(p_id uuid,p_message text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.customer_portal_events%rowtype;j public.jobs%rowtype;
begin
 select * into e from public.customer_portal_events where id=p_id;
 if e.id is null or e.actor<>'customer' or e.job_id is null then return jsonb_build_object('code',409,'error','Accept this booking before sending it to a mechanic.');end if;
 select * into j from public.jobs where id=e.job_id for update;
 select * into e from public.customer_portal_events where id=p_id for update;
 if regexp_replace(upper(j.registration),'[^A-Z0-9]','','g')<>e.registration or lower(trim(coalesce(j.customer_email,'')))<>e.customer_email then return jsonb_build_object('code',409,'error','The booking customer changed.');end if;
 if e.mechanic_at is null then
  update public.customer_portal_events set mechanic_at=clock_timestamp(),mechanic_message=p_message where id=e.id;
  update public.jobs set updated_at=clock_timestamp() where id=e.job_id;
 end if;
 return jsonb_build_object('code',200,'event_id',e.id,'already_forwarded',e.mechanic_at is not null);
end;$$;
revoke all on function public.vecta_forward_portal_event(uuid,text) from public,anon,authenticated;
grant execute on function public.vecta_forward_portal_event(uuid,text) to service_role;

create table if not exists public.workshop_push_subscriptions(endpoint text primary key,subscription jsonb not null,created_at timestamptz default now(),updated_at timestamptz default now());
alter table public.workshop_push_subscriptions add column audience text not null default 'manager' check(audience in ('manager','mechanic'));
alter table public.workshop_push_subscriptions enable row level security;
revoke all on public.workshop_push_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.workshop_push_subscriptions to service_role;
notify pgrst,'reload schema';

-- Include outbound messages without granting customers access to Message Centre.
-- Recipient matching prevents a previous owner's mail entering this portal.
create function public.vecta_portal_email_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; txt text; key text; stamp timestamptz; st text; recipient text;
begin
 if tg_table_name='workshop_messages' then
  if new.job_id !~ '^[0-9a-f-]{36}$' then return new;end if;
  select * into j from public.jobs where id=new.job_id::uuid;
  txt:=new.body;key:='prepared:'||new.id::text;stamp:=new.occurred_at;st:='prepared';recipient:=new.recipient;
 else
  if new.status<>'sent' or new.message_payload->>'text' is null or new.job_id !~ '^[0-9a-f-]{36}$' then return new;end if;
  select * into j from public.jobs where id=new.job_id::uuid;
  txt:=new.message_payload->>'text';key:='email:'||new.id;stamp:=coalesce(new.sent_at,new.created_at);st:='sent';recipient:=new.recipient;
 end if;
 if j.id is null or trim(coalesce(j.customer_email,''))='' or lower(trim(recipient))<>lower(trim(j.customer_email)) then return new;end if;
 insert into public.customer_portal_events(job_id,registration,customer_email,kind,actor,message,details,created_at,dedupe_key)
 values(j.id,regexp_replace(upper(j.registration),'[^A-Z0-9]','','g'),lower(trim(j.customer_email)),'correspondence','workshop',left(txt,30000),jsonb_build_object('delivery',st),stamp,key) on conflict(dedupe_key) do nothing;
 return new;
end;$$;
revoke all on function public.vecta_portal_email_audit() from public,anon,authenticated;
create trigger vecta_portal_email_audit after insert or update on public.nmuk_service_reminder_sends for each row execute function public.vecta_portal_email_audit();
create trigger vecta_portal_email_audit after insert on public.workshop_messages for each row execute function public.vecta_portal_email_audit();
insert into public.customer_portal_events(job_id,registration,customer_email,kind,actor,message,details,created_at,dedupe_key)
select j.id,regexp_replace(upper(j.registration),'[^A-Z0-9]','','g'),lower(trim(j.customer_email)),'correspondence','workshop',left(h.body,30000),jsonb_build_object('delivery',h.status),h.occurred_at,h.id
from public.workshop_message_history h join public.jobs j on j.id::text=h.job_id
where h.kind<>'booking' and h.status in ('sent','prepared') and h.body is not null and trim(coalesce(j.customer_email,''))<>'' and lower(trim(h.recipient))=lower(trim(j.customer_email)) on conflict(dedupe_key) do nothing;

-- Background delivery retries are independent of the customer response. A
-- failed notification can never roll back an approved job or cancellation.
alter table public.customer_portal_events add column manager_push_done boolean not null default false;
alter table public.customer_portal_events add column mechanic_push_done boolean not null default false;
alter table public.customer_portal_events add column push_attempts integer not null default 0;
alter table public.customer_portal_events add column push_next_at timestamptz;
create index customer_portal_push_pending_idx on public.customer_portal_events(seq) where (manager_alert and not manager_push_done) or (mechanic_at is not null and not mechanic_push_done);
notify pgrst,'reload schema';
