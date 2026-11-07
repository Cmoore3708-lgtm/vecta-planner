-- Administrative, audited amendments only. Ordinary clients cannot unlock snapshots.
create schema if not exists vecta_audit;
create table if not exists vecta_audit.invoice_amendments (
  request_id text primary key check (length(btrim(request_id)) between 8 and 200),
  invoice_id uuid not null references public.invoices(id),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  actor text not null,
  recorded_at timestamptz not null default now(),
  transaction_id bigint not null default txid_current(),
  monthly_lines jsonb not null,
  original_invoice jsonb not null,
  revised_invoice jsonb not null,
  original_protected_value jsonb
);
alter table vecta_audit.invoice_amendments enable row level security;
revoke all on vecta_audit.invoice_amendments from public, anon, authenticated, service_role;

create or replace function vecta_audit.keep_invoice_amendments()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'Invoice amendment history cannot be changed or deleted';
end;
$$;
revoke all on function vecta_audit.keep_invoice_amendments() from public, anon, authenticated, service_role;
drop trigger if exists keep_invoice_amendments on vecta_audit.invoice_amendments;
create trigger keep_invoice_amendments before update or delete on vecta_audit.invoice_amendments
for each row execute function vecta_audit.keep_invoice_amendments();

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
      -- Exact, append-only authorisation written by the private administrative routine.
      -- Browser writes and ordinary invoice saves cannot create this authorisation.
      if current_user <> 'postgres' then
        raise exception 'The saved fleet job breakdown is immutable';
      end if;
      if not exists (
        select 1 from vecta_audit.invoice_amendments a
        where a.invoice_id=old.id and a.transaction_id=pg_catalog.txid_current()
          and (a.original_invoice-'updated_at')=(to_jsonb(old)-'updated_at')
          and (a.revised_invoice-'updated_at')=(to_jsonb(new)-'updated_at')
      ) then
        raise exception 'The saved fleet job breakdown is immutable';
      end if;
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


-- This is deliberately not an exposed RPC or a browser-controlled unlock flag.
-- It restores saved monthly charges only; job evidence and billed identities stay frozen.
create or replace function vecta_audit.restore_nmuk_invoice_monthly_charges(
  p_invoice_id uuid,
  p_expected_updated_at timestamptz,
  p_monthly_lines jsonb,
  p_expected_subtotal numeric,
  p_reason text,
  p_request_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  original public.invoices%rowtype;
  revised public.invoices%rowtype;
  prior vecta_audit.invoice_amendments%rowtype;
  saved_monthly jsonb;
  protected_value jsonb;
  jobs_total numeric;
  monthly_total numeric;
begin
  if current_user <> 'postgres' then
    raise exception 'A database administrator must review this invoice amendment';
  end if;
  if p_request_id is null or length(btrim(p_request_id)) not between 8 and 200
     or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
     or p_expected_updated_at is null or p_expected_subtotal is null then
    raise exception 'Amendment identity, reason and expected invoice state are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1447383892,23);
  select * into original from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select * into prior from vecta_audit.invoice_amendments where request_id=p_request_id;
  if found then
    if prior.invoice_id=p_invoice_id and prior.monthly_lines=p_monthly_lines
       and prior.reason=p_reason and (prior.revised_invoice->>'subtotal')::numeric=p_expected_subtotal
       and (prior.original_invoice->>'updated_at')::timestamptz=p_expected_updated_at
       and (to_jsonb(original)-'updated_at')=(prior.revised_invoice-'updated_at') then
      return jsonb_build_object('invoice_id',original.id,'invoice_number',original.invoice_number,
        'subtotal',original.subtotal,'vat',original.vat,'total',original.total,'already_applied',true);
    end if;
    raise exception 'This amendment identity was already used for a different invoice state';
  end if;
  if original.updated_at is distinct from p_expected_updated_at then
    raise exception 'The invoice changed; refresh before amending it';
  end if;
  if original.fleet_customer is distinct from 'NMUK' or original.fleet_month is null
     or original.status not in ('saved','draft') or original.status is null
     or coalesce(original.payment_method,'')<>''
     or coalesce(original.lines->0->>'invoice_paid_date','')<>'' then
    raise exception 'Only an unpaid NMUK fleet invoice can receive missing monthly charges';
  end if;
  if jsonb_typeof(original.lines) is distinct from 'array' or jsonb_array_length(original.lines)<>1
     or original.lines->0->>'vat_mode' is distinct from 'ex_vat'
     or original.lines->0->'nmuk_monthly_extras' is distinct from '[]'::jsonb
     or jsonb_typeof(original.fleet_job_snapshot->'rows') is distinct from 'array'
     or jsonb_array_length(original.fleet_job_snapshot->'rows')=0 then
    raise exception 'This invoice is not a proven jobs-only invoice with frozen evidence';
  end if;
  if jsonb_typeof(p_monthly_lines) is distinct from 'array'
     or jsonb_array_length(p_monthly_lines)=0 then
    raise exception 'Individual saved monthly charge lines are required';
  end if;
  select value->'nmukPreviewDrafts'->original.fleet_month into saved_monthly
  from public.workshop_settings where id='main' for share;
  if saved_monthly is distinct from p_monthly_lines then
    raise exception 'Monthly charges changed or were not saved; refresh before amending';
  end if;
  if exists(select 1 from jsonb_array_elements(p_monthly_lines) x
    where jsonb_typeof(x) is distinct from 'object'
      or jsonb_typeof(x->'amount') is distinct from 'number'
      or x->>'vat_mode' is distinct from 'ex_vat'
      or x->>'section' not in ('internal','other') or x->>'section' is null
      or coalesce(btrim(x->>'description'),'')=''
      or (x->>'amount')::numeric<>round((x->>'amount')::numeric,2)) then
    raise exception 'Monthly charges need valid descriptions, allocations and ex-VAT amounts';
  end if;
  select sum((x->>'amount')::numeric) into jobs_total
  from jsonb_array_elements(original.fleet_job_snapshot->'rows') x;
  select sum((x->>'amount')::numeric) into monthly_total from jsonb_array_elements(p_monthly_lines) x;
  if jobs_total is null or monthly_total is null or monthly_total<=0
     or original.subtotal is distinct from jobs_total
     or (original.lines->0->>'amount')::numeric is distinct from jobs_total
     or (original.fleet_job_snapshot->>'subtotal')::numeric is distinct from jobs_total
     or (original.fleet_job_snapshot->>'total')::numeric is distinct from original.total
     or original.vat is distinct from round(jobs_total*0.2,2)
     or original.total is distinct from original.subtotal+original.vat
     or p_expected_subtotal is distinct from jobs_total+monthly_total then
    raise exception 'Invoice, frozen breakdown and expected total do not reconcile';
  end if;
  revised:=original;
  revised.lines:=jsonb_set(jsonb_set(original.lines,'{0,nmuk_monthly_extras}',p_monthly_lines),
    '{0,amount}',to_jsonb(p_expected_subtotal));
  revised.subtotal:=p_expected_subtotal;
  revised.vat:=round(revised.subtotal*0.2,2);
  revised.total:=revised.subtotal+revised.vat;
  revised.updated_at:=now();
  revised.fleet_job_snapshot:=jsonb_set(jsonb_set(jsonb_set(original.fleet_job_snapshot,
    '{invoice_lines}',revised.lines),'{subtotal}',to_jsonb(revised.subtotal)),
    '{total}',to_jsonb(revised.total));
  select value into protected_value from public.workshop_settings
  where id='invoice_protected:'||original.id::text for update;
  if protected_value is not null and (
    protected_value->'invoice'->>'id' is distinct from original.id::text
    or protected_value->'invoice'->'lines' is distinct from original.lines
    or (protected_value->'invoice'->>'subtotal')::numeric is distinct from original.subtotal
    or (protected_value->'invoice'->>'total')::numeric is distinct from original.total) then
    raise exception 'Protected invoice and invoice register disagree; review before amending';
  end if;
  insert into vecta_audit.invoice_amendments(request_id,invoice_id,reason,actor,monthly_lines,
    original_invoice,revised_invoice,original_protected_value)
  values(p_request_id,original.id,p_reason,current_user,p_monthly_lines,
    to_jsonb(original),to_jsonb(revised),protected_value);
  update public.invoices set lines=revised.lines,subtotal=revised.subtotal,vat=revised.vat,
    total=revised.total,fleet_job_snapshot=revised.fleet_job_snapshot,updated_at=revised.updated_at
  where id=original.id returning * into revised;
  insert into public.workshop_settings(id,value,updated_at)
  values('invoice_protected:'||revised.id::text,
    jsonb_set(jsonb_set(coalesce(protected_value,'{}'::jsonb),'{invoice}',to_jsonb(revised)),
      '{protected_at}',to_jsonb(now())),now())
  on conflict(id) do update set value=excluded.value,updated_at=excluded.updated_at;
  return jsonb_build_object('invoice_id',revised.id,'invoice_number',revised.invoice_number,
    'jobs_subtotal',jobs_total,'monthly_charges',monthly_total,'subtotal',revised.subtotal,
    'vat',revised.vat,'total',revised.total,'already_applied',false);
end;
$$;
revoke all on function vecta_audit.restore_nmuk_invoice_monthly_charges(uuid,timestamptz,jsonb,numeric,text,text)
from public,anon,authenticated,service_role;
