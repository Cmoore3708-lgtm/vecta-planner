-- Messages are read/written through the manager-authenticated API only.
create table public.workshop_messages (
  id uuid primary key,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  registration text not null default '',
  job_id text not null default '',
  invoice_id text not null default '',
  method text not null check (method in ('email','whatsapp','sms')),
  kind text not null,
  recipient text not null default '',
  subject text not null default '',
  body text not null,
  check (length(body) <= 30000)
);
alter table public.workshop_messages enable row level security;
revoke all on public.workshop_messages from public, anon, authenticated;
grant select, insert on public.workshop_messages to service_role;
create index workshop_messages_time_idx on public.workshop_messages (occurred_at desc, id desc);
create index workshop_messages_vehicle_idx on public.workshop_messages (registration, occurred_at desc);

-- Freeze the actual outgoing content in the existing atomic send reservation.
-- Do not change email idempotency keys, status rules or recipients.
alter table public.nmuk_service_reminder_sends add column message_payload jsonb;
do $$
declare r record; payload jsonb;
begin
  for r in select id,error from public.nmuk_service_reminder_sends
    where id like 'completion:%' and error is not null loop
    begin
      payload := r.error::jsonb -> 'payload';
      if jsonb_typeof(payload) = 'object' then
        update public.nmuk_service_reminder_sends set message_payload=payload where id=r.id;
      end if;
    exception when invalid_text_representation then null;
    end;
  end loop;
end;$$;
create index if not exists reminder_sends_history_idx
  on public.nmuk_service_reminder_sends ((coalesce(sent_at,created_at)) desc, id desc);

-- An invoker view keeps one stable, paginated timeline without copying send rows.
create view public.workshop_message_history with (security_invoker=true) as
select 'prepared:'||m.id::text as id, m.occurred_at, m.registration, m.job_id, m.invoice_id,
  m.method, m.kind, m.recipient, m.subject, m.body, 'prepared'::text as status,
  ''::text as sender, true as content_available
from public.workshop_messages m
union all
select 'email:'||s.id, coalesce(s.sent_at,s.created_at),
  regexp_replace(upper(coalesce(s.message_payload->>'registration',j.registration,'')), '[^A-Z0-9]', '', 'g'),
  s.job_id, '', 'email',
  case when s.id like 'completion:%' then 'collection' else 'booking_reminder' end,
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
  and coalesce(j.card_type,'job')='job' and coalesce(j.registration,'')<>'';
revoke all on public.workshop_message_history from public, anon, authenticated;
grant select on public.workshop_message_history to service_role;
-- The consistent backup function discovers all public tables automatically.
notify pgrst, 'reload schema';
