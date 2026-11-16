-- Verified Meta callbacks only. No browser or customer-portal access.
create table public.workshop_whatsapp_events (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  phone_number_id text not null,
  provider_message_id text not null,
  original_message_id text not null default '',
  event_type text not null check (event_type in ('message','edit','revoke')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  direction text not null check (direction in ('incoming','outgoing')),
  sender text not null,
  recipient text not null,
  body text not null check (length(body)<=30000)
);
alter table public.workshop_whatsapp_events enable row level security;
revoke all on public.workshop_whatsapp_events from public, anon, authenticated;
grant select, insert on public.workshop_whatsapp_events to service_role;
create index workshop_whatsapp_time_idx on public.workshop_whatsapp_events (occurred_at desc,id desc) where event_type='message';
create index workshop_whatsapp_receipt_idx on public.workshop_whatsapp_events (phone_number_id,recorded_at desc);
create index workshop_whatsapp_changes_idx on public.workshop_whatsapp_events (phone_number_id,original_message_id,occurred_at desc) where event_type in ('edit','revoke');

-- Keep all existing IDs/columns stable (customer portal also reads this view).
-- Apply the channel before pagination, including API-sent approval messages.
create or replace view public.workshop_message_history with (security_invoker=true) as
select 'prepared:'||m.id::text as id, m.occurred_at, m.registration, m.job_id, m.invoice_id,
  m.method, m.kind, m.recipient, m.subject, m.body, 'prepared'::text as status,
  ''::text as sender, true as content_available
from public.workshop_messages m
union all
select 'email:'||s.id, coalesce(s.sent_at,s.created_at),
  regexp_replace(upper(coalesce(s.message_payload->>'registration',j.registration,'')), '[^A-Z0-9]', '', 'g'),
  s.job_id, '', case when s.id like 'approval-wa:%' or s.id like 'portal-wa:%' then 'whatsapp' else 'email' end,
  case when s.id like 'approval:%' or s.id like 'approval-wa:%' then 'customer_approval'
    when s.id like 'completion:%' then 'collection' else 'booking_reminder' end,
  s.recipient, coalesce(s.message_payload->>'subject',case when s.id like 'completion:%' then 'Ready to collect' else 'Booking reminder' end),
  s.message_payload->>'text',
  case when s.status='pending' then 'unconfirmed' else s.status end,
  coalesce(s.message_payload->>'from',''), s.message_payload->>'text' is not null
from public.nmuk_service_reminder_sends s left join public.jobs j on j.id::text=s.job_id
union all
select 'booking:'||j.id::text, j.created_at,
  regexp_replace(upper(j.registration),'[^A-Z0-9]','','g'), j.id::text, '', 'system', 'booking',
  '', 'Booking record created',
  'Job created: '||j.created_at::text||E'\nCurrent booking date: '||j.booking_date::text||E'\nCurrent work: '||coalesce(j.work_required,''),
  'recorded', '', true
from public.jobs j where j.booking_date is not null and j.created_at is not null
  and coalesce(j.card_type,'job')='job' and coalesce(j.registration,'')<>''
union all
-- A phone number may belong to several jobs/cars. Never guess a registration.
-- Changes arriving before the original are applied when the original arrives.
select 'whatsapp:'||w.id, w.occurred_at, '', '', '', 'whatsapp', 'message',
  w.recipient, 'WhatsApp message', coalesce(change.body,w.body),
  case when w.direction='incoming' then 'received' else 'sent' end, w.sender, true
from public.workshop_whatsapp_events w
left join lateral (
  select e.body from public.workshop_whatsapp_events e
  where e.phone_number_id=w.phone_number_id and e.original_message_id=w.provider_message_id
    and e.event_type in ('edit','revoke')
  order by (e.event_type='revoke') desc,e.occurred_at desc,e.id desc limit 1
) change on true
where w.event_type='message';
revoke all on public.workshop_message_history from public, anon, authenticated;
grant select on public.workshop_message_history to service_role;
notify pgrst, 'reload schema';
