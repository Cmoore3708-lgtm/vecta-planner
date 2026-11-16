-- Customer sessions are checked by the server; browsers have no direct table/bucket access.
alter table public.customer_garage_vehicles
 add column insurance_document_id uuid,
 add column insurance_uploaded_at timestamptz,
 add column insurance_cleanup uuid[] not null default '{}';

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('customer-garage-insurance','customer-garage-insurance',false,1800000,array['image/jpeg']);
-- Intentionally no anon/authenticated Storage policies. Service-role access only.
