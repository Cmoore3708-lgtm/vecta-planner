create table public.customer_garage_accounts (
 id uuid primary key default gen_random_uuid(), email text not null unique, name text not null default '', phone text not null default '',
 created_at timestamptz not null default now()
);
create table public.customer_garage_challenges (
 id uuid primary key default gen_random_uuid(), email text not null, bucket_key text not null unique,
 code_hash text not null, attempts integer not null default 0 check(attempts between 0 and 5),
 expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now()
);
create table public.customer_garage_sessions (
 token_hash text primary key, account_id uuid not null references public.customer_garage_accounts(id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.customer_garage_vehicles (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.customer_garage_accounts(id) on delete cascade,
 registration text not null check(registration ~ '^[A-Z0-9]{2,8}$'), nickname text not null default '',
 family boolean not null default false, vehicle_data jsonb not null default '{}',
 mot_due date, tax_due date, service_due date, insurance_due date,
 mot_manual boolean not null default false, tax_manual boolean not null default false,
 reminders boolean not null default true, checked_at timestamptz, refresh_after timestamptz not null default now(), created_at timestamptz not null default now(),
 unique(account_id,registration)
);
create table public.customer_garage_push (
 id text primary key, account_id uuid not null references public.customer_garage_accounts(id) on delete cascade,
 subscription jsonb not null, last_seq bigint not null default 0,
 ready_jobs jsonb not null default '[]', reminder_receipts jsonb not null default '{}',
 next_check_at timestamptz not null default now(), lease_id uuid, lease_until timestamptz,
 created_at timestamptz not null default now()
);
create index customer_garage_sessions_account on public.customer_garage_sessions(account_id);
create index customer_garage_challenges_expiry on public.customer_garage_challenges(expires_at);
create index customer_garage_push_due on public.customer_garage_push(next_check_at);
create index customer_garage_push_account on public.customer_garage_push(account_id);
alter table public.customer_garage_accounts enable row level security;
alter table public.customer_garage_challenges enable row level security;
alter table public.customer_garage_sessions enable row level security;
alter table public.customer_garage_vehicles enable row level security;
alter table public.customer_garage_push enable row level security;
revoke all on public.customer_garage_accounts,public.customer_garage_challenges,public.customer_garage_sessions,public.customer_garage_vehicles,public.customer_garage_push from public,anon,authenticated;
grant select,insert,update,delete on public.customer_garage_accounts,public.customer_garage_challenges,public.customer_garage_sessions,public.customer_garage_vehicles,public.customer_garage_push to service_role;

create index customer_garage_vehicles_refresh on public.customer_garage_vehicles(refresh_after);
