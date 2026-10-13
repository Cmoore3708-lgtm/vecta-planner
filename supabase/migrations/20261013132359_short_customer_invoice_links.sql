create table public.invoice_customer_links (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  signed_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.invoice_customer_links enable row level security;
revoke all on table public.invoice_customer_links from public, anon, authenticated;
grant select, insert, delete on table public.invoice_customer_links to service_role;
create index invoice_customer_links_expiry_idx on public.invoice_customer_links (expires_at);
