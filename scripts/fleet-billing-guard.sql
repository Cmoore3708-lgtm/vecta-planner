-- Additive only: do not recalculate or backfill existing invoice evidence.
alter table public.invoices add column if not exists fleet_job_snapshot jsonb;
create index if not exists invoices_fleet_job_ids_gin on public.invoices using gin(fleet_job_ids);

create or replace function public.vecta_guard_invoice_job_links()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  linked text[];
  item text;
  conflict_number text;
  snapshot_ids text[];
begin
  -- Same transaction lock as invoice allocation; also covers old clients writing directly.
  perform pg_catalog.pg_advisory_xact_lock(1447383892,23);
  if jsonb_typeof(coalesce(new.fleet_job_ids,'[]'::jsonb)) <> 'array' then
    raise exception 'Fleet job IDs must be an array';
  end if;
  select coalesce(array_agg(value order by value),array[]::text[]) into linked
  from jsonb_array_elements_text(coalesce(new.fleet_job_ids,'[]'::jsonb));
  if cardinality(linked) <> (select count(distinct x) from unnest(linked) x) then
    raise exception 'The same job appears more than once in this invoice';
  end if;
  if new.job_id is not null then linked:=array_append(linked,new.job_id::text); end if;
  if tg_op='UPDATE' then
    if old.job_id is not null and new.job_id is distinct from old.job_id then
      raise exception 'A billed job cannot be detached from its invoice. Review the original invoice.';
    end if;
    if jsonb_array_length(coalesce(old.fleet_job_ids,'[]'::jsonb))>0
       and new.fleet_job_ids is distinct from old.fleet_job_ids then
      raise exception 'Saved fleet job links cannot be replaced. Review the original invoice.';
    end if;
    if old.fleet_month is not null and new.fleet_month is distinct from old.fleet_month then
      raise exception 'The billing month of a saved fleet invoice cannot change';
    end if;
    if old.fleet_job_snapshot is not null and new.fleet_job_snapshot is distinct from old.fleet_job_snapshot then
      raise exception 'The saved fleet job breakdown is immutable';
    end if;
  end if;
  foreach item in array linked loop
    if item is null or item='' then raise exception 'A billed job identity cannot be blank'; end if;
    select i.invoice_number into conflict_number from public.invoices i
    where i.id<>new.id and (i.job_id::text=item or i.fleet_job_ids ? item) limit 1;
    if found then
      raise exception 'Job % is already billed on invoice %. Review that invoice instead.',item,conflict_number using errcode='23505';
    end if;
  end loop;
  if tg_op='INSERT' and jsonb_array_length(coalesce(new.fleet_job_ids,'[]'::jsonb))>0 then
    if new.fleet_job_snapshot is null or jsonb_typeof(new.fleet_job_snapshot->'rows') is distinct from 'array' then
      raise exception 'Refresh Workshop Pro before creating a fleet invoice: frozen job evidence is required';
    end if;
    select coalesce(array_agg(value->'job'->>'id' order by value->'job'->>'id'),array[]::text[]) into snapshot_ids
    from jsonb_array_elements(new.fleet_job_snapshot->'rows');
    if snapshot_ids is distinct from (select array_agg(value order by value) from jsonb_array_elements_text(new.fleet_job_ids)) then
      raise exception 'Frozen job evidence does not match the billed job identities';
    end if;
    if exists (
      select 1 from jsonb_array_elements(new.fleet_job_snapshot->'rows') r
      left join public.jobs j on j.id::text=r->'job'->>'id'
      where j.id is null or j.status='deleted'
        or (r->'job'->>'work_required') is distinct from j.work_required
        or (r->'job'->>'customer_note') is distinct from j.customer_note
        or (r->'job'->>'amount_quoted')::numeric is distinct from j.amount_quoted
    ) then raise exception 'A billed job changed or disappeared. Refresh the preview before invoicing.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.vecta_guard_invoice_job_links() from public,anon;
drop trigger if exists vecta_guard_invoice_job_links on public.invoices;
create trigger vecta_guard_invoice_job_links before insert or update on public.invoices
for each row execute function public.vecta_guard_invoice_job_links();
