create table public.mechanic_message_receipts (
  job_id uuid not null references public.jobs(id) on delete cascade,
  message_id uuid not null,
  action text not null check (action in ('done','snooze')),
  message text not null,
  recorded_at timestamptz not null default now(),
  primary key (message_id, action)
);
create index mechanic_message_receipts_job on public.mechanic_message_receipts(job_id,recorded_at desc);
alter table public.mechanic_message_receipts enable row level security;
revoke all on public.mechanic_message_receipts from public, anon, authenticated;
grant select, insert, update on public.mechanic_message_receipts to service_role;
