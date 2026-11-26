alter table public.customer_garage_accounts
  add column contact_preference text check (contact_preference in ('Email','Telephone','WhatsApp'));
