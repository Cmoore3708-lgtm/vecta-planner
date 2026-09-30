-- VECTA Admin v1: website content is private-by-default and only mutated by server-side admin APIs.
create table if not exists website_content (
  id text primary key default 'main',
  draft jsonb not null default '{}'::jsonb,
  published jsonb not null default '{}'::jsonb,
  published_version integer not null default 0,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table website_content enable row level security;

create table if not exists website_content_history (
  id uuid primary key default gen_random_uuid(),
  website_id text not null default 'main',
  version integer not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);
alter table website_content_history enable row level security;
create index if not exists website_content_history_version_idx
  on website_content_history (website_id, version desc);

insert into website_content (id, draft, published)
values ('main', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
