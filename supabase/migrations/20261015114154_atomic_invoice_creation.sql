-- Additive prerequisite for new clients. Existing invoice rows are not rewritten.
alter table public.invoices
  add column if not exists customer_address text,
  add column if not exists eom_month text,
  add column if not exists fleet_customer text,
  add column if not exists fleet_job_ids jsonb,
  add column if not exists fleet_month text,
  add column if not exists mileage text,
  add column if not exists mot_due date,
  add column if not exists payment_method text,
  add column if not exists source text;

-- Keep the same protections already installed in production. Fail rather than
-- silently deleting/renumbering records if an older environment has duplicates.
create unique index if not exists invoices_invoice_number_unique
  on public.invoices(invoice_number) where nullif(btrim(invoice_number),'') is not null;
create unique index if not exists invoices_job_id_unique
  on public.invoices(job_id) where job_id is not null;

create or replace function public.vecta_create_invoice(p_invoice jsonb,p_prefix text default 'VECTA')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  requested public.invoices%rowtype;
  existing public.invoices%rowtype;
  saved public.invoices%rowtype;
  prefix text := btrim(p_prefix);
  payload jsonb;
  field text;
  next_number numeric;
  candidate text;
  violated_constraint text;
  attempt integer;
begin
  if current_user <> 'service_role' and
     (auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'vecta_access','') <> 'workshop') then
    raise exception using errcode='42501',message='Workshop authorisation required';
  end if;
  if p_invoice is null or jsonb_typeof(p_invoice)<>'object' or octet_length(p_invoice::text)>1048576 then
    raise exception using errcode='22023',message='Invalid invoice payload';
  end if;
  if prefix is null or prefix !~ '^[A-Za-z0-9._/-]{1,40}$' then
    raise exception using errcode='22023',message='Invalid invoice prefix';
  end if;
  for field in select jsonb_object_keys(p_invoice) loop
    if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.invoices'::regclass and a.attname=field and a.attnum>0 and not a.attisdropped) then
      raise exception using errcode='22023',message='Unsupported invoice field: '||field;
    end if;
  end loop;
  if nullif(p_invoice->>'id','') is null then
    raise exception using errcode='22023',message='A stable invoice identity is required';
  end if;
  payload := jsonb_build_object('status','saved','lines','[]'::jsonb)||p_invoice;
  requested := jsonb_populate_record(null::public.invoices,payload);
  if requested.status not in ('draft','saved') or jsonb_typeof(requested.lines)<>'array' or jsonb_array_length(requested.lines)>2000 then
    raise exception using errcode='22023',message='Invalid new invoice status or lines';
  end if;
  if requested.total is null or requested.subtotal is null or requested.vat is null or
     requested.total::text in ('NaN','Infinity','-Infinity') or
     requested.subtotal::text in ('NaN','Infinity','-Infinity') or requested.vat::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023',message='Valid invoice totals are required';
  end if;

  -- The allocator and insert share one transaction. There is no reserved-number
  -- placeholder or second browser write that can leave a half-created invoice.
  perform pg_catalog.pg_advisory_xact_lock(1447383892,23);
  select * into existing from public.invoices where id=requested.id for update;
  if found then
    -- A retry is a receipt, never an upsert of stale payment/status/line data.
    for field in select key from jsonb_each(payload) where key not in ('invoice_number','created_at','updated_at') loop
      if (to_jsonb(existing)->field) is distinct from (payload->field) then
        raise exception using errcode='23505',message='This invoice identity is already saved with different details. Open the saved invoice before editing it.';
      end if;
    end loop;
    return jsonb_build_object('invoice',to_jsonb(existing),'created',false);
  end if;
  if requested.job_id is not null and exists(select 1 from public.invoices where job_id=requested.job_id) then
    raise exception using errcode='23505',message='This job already has an invoice in the cloud register.';
  end if;

  for attempt in 1..5 loop
    select coalesce(max(substring(invoice_number from '([0-9]+)$')::numeric),0)+1 into next_number from public.invoices;
    if next_number>999999999999 then
      raise exception using errcode='22023',message='Invoice sequence needs review';
    end if;
    candidate := prefix||'-'||lpad(next_number::text,greatest(5,length(next_number::text)),'0');
    requested.invoice_number := candidate;
    requested.created_at := clock_timestamp();
    requested.updated_at := requested.created_at;
    begin
      insert into public.invoices select requested.* returning * into saved;
      return jsonb_build_object('invoice',to_jsonb(saved),'created',true);
    exception when unique_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      -- Older open tabs do not take the allocator lock. Their unique-number
      -- collision is retried here without renumbering or overwriting their row.
      if violated_constraint <> 'invoices_invoice_number_unique' or attempt=5 then raise; end if;
    end;
  end loop;
  raise exception 'Invoice allocation failed';
end;
$$;
revoke all on function public.vecta_create_invoice(jsonb,text) from public,anon;
grant execute on function public.vecta_create_invoice(jsonb,text) to authenticated,service_role;
