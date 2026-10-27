-- Private workshop booking data: existing RLS permits authorised workshop sessions only.
alter table public.website_booking_requests add column if not exists gsf_parts jsonb;
comment on column public.website_booking_requests.gsf_parts is 'Server-captured GSF purchase costs excluding VAT, with part identity and pack quantity; never customer sale prices.';
