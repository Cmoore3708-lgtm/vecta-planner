-- Run once in Supabase SQL Editor before enabling iPhone booking alerts.
create table if not exists public.workshop_push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workshop_push_subscriptions enable row level security;
revoke all on table public.workshop_push_subscriptions from anon, authenticated;
