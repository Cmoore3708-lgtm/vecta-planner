-- Additive, service-only storage. A customer capability is revalidated by the
-- existing portal before registration and before every notification delivery.
create table if not exists public.customer_app_subscriptions (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  subscription jsonb not null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  token_encrypted text not null,
  last_seq bigint not null default 0 check (last_seq >= 0),
  was_ready boolean not null default false,
  next_check_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.customer_app_subscriptions enable row level security;
revoke all on public.customer_app_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.customer_app_subscriptions to service_role;
create index if not exists customer_app_subscriptions_due on public.customer_app_subscriptions (next_check_at);
comment on table public.customer_app_subscriptions is 'Opt-in customer phone alerts. Service-only; encrypted expiring booking capability; separate from workshop push subscriptions.';
