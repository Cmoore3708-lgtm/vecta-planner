-- Run only in isolated Test. All fixture rows and changes roll back.
begin;
set local role service_role;
do $$
declare
 id1 uuid:=gen_random_uuid(); id2 uuid:=gen_random_uuid(); id3 uuid:=gen_random_uuid();
 job uuid:=gen_random_uuid(); body jsonb; receipt jsonb; retry jsonb; n1 numeric; n2 numeric;
 before_count integer; before_total numeric;
begin
 select count(*),coalesce(sum(total),0) into before_count,before_total from public.invoices;
 insert into public.jobs(id,registration,customer_name,work_required) values(job,'SYNTHETIC','Synthetic Test','Atomic invoice test');
 body:=jsonb_build_object('id',id1,'job_id',job,'registration','SYNTHETIC','invoice_date',current_date,'status','saved','customer_name','Synthetic Test','customer_address','Test address','payment_method','','lines',jsonb_build_array(jsonb_build_object('description','Synthetic test only','amount',100,'vat_mode','ex_vat')),'subtotal',100,'vat',20,'total',120);
 receipt:=public.vecta_create_invoice(body,'TEST-ATOMIC');
 if not (receipt->>'created')::boolean or receipt->'invoice'->>'customer_address'<>'Test address' or (receipt->'invoice'->>'total')::numeric<>120 then raise exception 'Invalid first receipt'; end if;
 n1:=substring(receipt->'invoice'->>'invoice_number' from '([0-9]+)$')::numeric;
 retry:=public.vecta_create_invoice(body||jsonb_build_object('invoice_number','ignored-local-number'),'TEST-ATOMIC');
 if (retry->>'created')::boolean or retry->'invoice'->>'invoice_number'<>receipt->'invoice'->>'invoice_number' then raise exception 'Retry allocated twice'; end if;
 begin
  perform public.vecta_create_invoice(body||jsonb_build_object('total',121),'TEST-ATOMIC');
  raise exception 'Changed retry overwrote invoice';
 exception when unique_violation then null; end;
 begin
  perform public.vecta_create_invoice(body||jsonb_build_object('id',id2),'TEST-ATOMIC');
  raise exception 'Duplicate job invoiced twice';
 exception when unique_violation then null; end;
 update public.invoices set payment_method='BACS' where id=id1;
 begin
  perform public.vecta_create_invoice(body,'TEST-ATOMIC');raise exception 'Stale retry accepted changed payment';
 exception when unique_violation then null;end;
 if (select payment_method from public.invoices where id=id1)<>'BACS' then raise exception 'Payment reverted';end if;
 begin
  perform public.vecta_create_invoice(body||jsonb_build_object('id',id3,'job_id',gen_random_uuid()),'TEST-ATOMIC');
  raise exception 'Invalid job link created an invoice';
 exception when foreign_key_violation then null;end;
 if exists(select 1 from public.invoices where id=id3) then raise exception 'Failed invoice left a row';end if;
 retry:=public.vecta_create_invoice((body-'job_id')||jsonb_build_object('id',id2),'TEST-ATOMIC');
 n2:=substring(retry->'invoice'->>'invoice_number' from '([0-9]+)$')::numeric;
 if n2<>n1+1 then raise exception 'Failed insert consumed a number';end if;
 if (select count(*) from public.invoices)<>before_count+2 or (select coalesce(sum(total),0) from public.invoices)<>before_total+240 then raise exception 'Unexpected invoice mutation';end if;
end;
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{}}',true);
do $$begin
 begin
  perform public.vecta_create_invoice('{}');raise exception 'Unrelated authenticated user accepted';
 exception when insufficient_privilege then null;end;
end;$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"vecta_access":"workshop"}}',true);
do $$declare r jsonb;begin
 r:=public.vecta_create_invoice(jsonb_build_object('id',gen_random_uuid(),'invoice_date',current_date,'lines','[]'::jsonb,'subtotal',0,'vat',0,'total',0),'TEST-AUTH');
 if r->'invoice'->>'invoice_number' is null then raise exception 'Authorised workshop receipt missing';end if;
end;$$;
rollback;

do $$begin
 if has_function_privilege('anon','public.vecta_create_invoice(jsonb,text)','execute') then raise exception 'Anonymous execute granted';end if;
end;$$;
