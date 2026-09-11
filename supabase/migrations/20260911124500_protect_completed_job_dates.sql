-- Financial controls: completed work must always retain a usable completion date.
alter table public.jobs
  add column if not exists completed_at timestamptz;

create or replace function public.vecta_protect_completed_job_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  recognised boolean;
begin
  recognised := lower(coalesce(new.status, '')) in
    ('completed', 'complete', 'invoiced', 'invoice_created', 'ready_to_invoice', 'ready');

  if recognised and new.completed_at is null then
    if new.booking_date is not null then
      new.completed_at := (new.booking_date::text || ' 17:00:00+00')::timestamptz;
    elsif tg_op = 'UPDATE' and old.completed_at is not null then
      new.completed_at := old.completed_at;
    elsif tg_op = 'UPDATE' and old.booking_date is not null then
      new.completed_at := (old.booking_date::text || ' 17:00:00+00')::timestamptz;
    else
      raise exception 'A completed job must have a booking or completion date';
    end if;
  end if;

  if recognised and tg_op = 'UPDATE' and new.booking_date is null and old.booking_date is not null then
    new.completed_at := coalesce(new.completed_at, (old.booking_date::text || ' 17:00:00+00')::timestamptz);
  end if;

  return new;
end;
$$;

drop trigger if exists vecta_protect_completed_job_date on public.jobs;
create trigger vecta_protect_completed_job_date
before insert or update of status, booking_date, completed_at on public.jobs
for each row execute function public.vecta_protect_completed_job_date();

create index if not exists jobs_completed_at_idx
  on public.jobs (completed_at)
  where completed_at is not null;

-- This historical Vehicle Tax invoice was correctly zero-rated, but its source job
-- carried a conflicting VAT mode. Keep source and invoice consistent.
update public.jobs
set vat_mode = 'no_vat', updated_at = now()
where id = 'e82946d1-5bf0-4f2e-af89-e8206318ba86'
  and lower(coalesce(source, '')) = 'vehicle_tax_admin'
  and lower(coalesce(vat_mode, '')) <> 'no_vat';
