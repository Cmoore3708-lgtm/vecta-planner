create table if not exists public.staff_reminder_sends (
 id text primary key,
 registration text not null,
 kind text not null check (kind in ('MOT','Service')),
 due_date date not null,
 stage text not null check (stage in ('30-day','14-day')),
 recipient text not null,
 status text not null check (status in ('pending','sent','failed')),
 provider_id text,
 error text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
alter table public.staff_reminder_sends enable row level security;
revoke all on public.staff_reminder_sends from anon, authenticated;
grant select, insert, update on public.staff_reminder_sends to service_role;
