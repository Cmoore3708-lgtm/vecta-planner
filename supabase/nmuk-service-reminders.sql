create table if not exists public.nmuk_service_reminder_sends (
  id text primary key,
  job_id text not null,
  booking_date date not null,
  recipient text not null,
  status text not null check (status in ('pending','sent','failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.nmuk_service_reminder_sends enable row level security;
-- Access only through the service-role cron endpoint; no anonymous policy.
revoke all on public.nmuk_service_reminder_sends from anon, authenticated;
grant select, insert, update on public.nmuk_service_reminder_sends to service_role;
