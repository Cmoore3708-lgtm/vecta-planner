alter table public.invoices
  add column if not exists customer_address text,
  add column if not exists eom_month text,
  add column if not exists fleet_customer text,
  add column if not exists fleet_job_ids jsonb not null default '[]'::jsonb,
  add column if not exists fleet_month text,
  add column if not exists mileage text,
  add column if not exists mot_due date,
  add column if not exists payment_method text,
  add column if not exists source text;

create unique index if not exists invoices_invoice_number_unique
  on public.invoices (invoice_number)
  where nullif(btrim(invoice_number), '') is not null;

create unique index if not exists invoices_job_id_unique
  on public.invoices (job_id)
  where job_id is not null;

alter table public.invoices
  drop constraint if exists invoices_payment_method_valid;

alter table public.invoices
  add constraint invoices_payment_method_valid
  check (payment_method is null or payment_method in ('', 'card', 'cash', 'bacs'));
