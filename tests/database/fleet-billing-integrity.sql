-- Run inside a transaction after installing the migration, then ROLLBACK.
do $$
declare
  j uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid();
  b uuid:=gen_random_uuid();
  snapshot jsonb;
  blocked boolean;
begin
  insert into public.jobs(id,registration,booking_date,work_required,amount_quoted,customer_note,status,completed_at)
  values(j,'BILLING-GUARD-TEST','2026-10-01','Service and fuel line',250,'','completed','2026-10-01T10:23:00Z');
  select jsonb_build_object('version',1,'rows',jsonb_build_array(jsonb_build_object('job',to_jsonb(x),'date','2026-10-01','amount',250,'customer','NMUK')))
  into snapshot from public.jobs x where id=j;
  insert into public.invoices(id,invoice_number,fleet_customer,fleet_month,fleet_job_ids,fleet_job_snapshot,subtotal,vat,total)
  values(a,'BILLING-GUARD-TEST-A','NMUK','2026-10',jsonb_build_array(j::text),snapshot,250,50,300);
  blocked:=false;
  begin
    insert into public.invoices(id,invoice_number,fleet_customer,fleet_month,fleet_job_ids,fleet_job_snapshot,subtotal,vat,total)
    values(b,'BILLING-GUARD-TEST-B','NMUK','2026-11',jsonb_build_array(j::text),snapshot,250,50,300);
  exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'FAIL: repeat billing across months was allowed'; end if;
  blocked:=false;
  begin insert into public.invoices(id,invoice_number,job_id) values(b,'BILLING-GUARD-TEST-B',j);
  exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'FAIL: ordinary invoice could bill fleet work again'; end if;
  blocked:=false;
  begin update public.invoices set fleet_job_ids='[]' where id=a;
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: original invoice could lose its job links'; end if;
  blocked:=false;
  begin update public.invoices set fleet_job_snapshot='{}' where id=a;
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: frozen evidence could be overwritten'; end if;
  update public.jobs set work_required='Later edited description',amount_quoted=275 where id=j;
  if (select fleet_job_snapshot->'rows'->0->'job'->>'work_required' from public.invoices where id=a)<>'Service and fuel line' then
    raise exception 'FAIL: job edit changed invoice evidence';
  end if;
  update public.invoices set customer_address='Updated address' where id=a;
  if (select total from public.invoices where id=a)<>300 then raise exception 'FAIL: invoice total changed'; end if;
end;
$$;
