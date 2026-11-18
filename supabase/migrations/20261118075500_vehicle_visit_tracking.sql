-- Presence belongs to a particular visit. Billing follows the invoice register.
alter table public.jobs
  add column if not exists visit_presence text check (visit_presence in ('missing','waiting','collected')),
  add column if not exists visit_presence_date date,
  add column if not exists visit_billing text check (visit_billing in ('due','paid'));

create or replace function public.refresh_vehicle_visit_billing(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  plate text;
  billing text;
begin
  select regexp_replace(upper(registration), '[^A-Z0-9]', '', 'g') into plate
  from public.jobs where id = target for update;
  if plate is null or plate = '' then return; end if;
  select case when count(*) = 0 then null
    when bool_and(lower(coalesce(i.status,'')) not in ('part_paid','part_refunded')
      and (lower(coalesce(i.payment_method,'')) in ('cash','card','bacs') or lower(coalesce(i.status,'')) = 'paid')) then 'paid'
    else 'due' end into billing
  from public.invoices i where i.job_id = target
    and regexp_replace(upper(i.registration), '[^A-Z0-9]', '', 'g') = plate
    and lower(coalesce(i.status,'')) not in ('draft','void','cancelled','canceled','deleted','refunded')
    and nullif(i.fleet_customer,'') is null and nullif(i.eom_month::text,'') is null
    and coalesce(i.source,'') not in ('fleet_eom','vehicle_tax_eom');
  update public.jobs set visit_billing = billing where id = target and visit_billing is distinct from billing;
end $$;
revoke all on function public.refresh_vehicle_visit_billing(uuid) from public;

create or replace function public.vehicle_visit_invoice_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' and old.job_id is not null then
    perform public.refresh_vehicle_visit_billing(old.job_id);
  end if;
  if tg_op <> 'DELETE' and new.job_id is not null and (tg_op = 'INSERT' or new.job_id is distinct from old.job_id) then
    perform public.refresh_vehicle_visit_billing(new.job_id);
  end if;
  return null;
end $$;
revoke all on function public.vehicle_visit_invoice_changed() from public;
drop trigger if exists vehicle_visit_invoice_changed on public.invoices;
create trigger vehicle_visit_invoice_changed after insert or delete or update of
  job_id,registration,status,payment_method,fleet_customer,eom_month,source on public.invoices
  for each row execute function public.vehicle_visit_invoice_changed();

-- Initialise only the new tracking field for vehicles on today's diary.
select public.refresh_vehicle_visit_billing(j.id) from public.jobs j
where j.booking_date = (current_timestamp at time zone 'Europe/London')::date
  and exists (select 1 from public.invoices i where i.job_id = j.id);
