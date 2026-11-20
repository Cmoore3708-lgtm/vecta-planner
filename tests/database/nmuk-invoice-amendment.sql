-- Execute inside BEGIN / ROLLBACK. Never commit these fixtures.
do $$
declare
  job_id uuid:=gen_random_uuid();
  invoice_id uuid:=gen_random_uuid();
  amendment_request text:='amendment-test-'||gen_random_uuid()::text;
  snapshot jsonb;
  lines jsonb:='[{"description":"Fleet work","amount":250,"vat_mode":"ex_vat","nmuk_monthly_extras":[]}]';
  monthly jsonb:='[{"description":"Maintenance","amount":100,"section":"other","vat_mode":"ex_vat","nmuk_monthly_extra":true},{"description":"Tyres","amount":50,"section":"internal","vat_mode":"ex_vat","nmuk_monthly_extra":true}]';
  expected_updated_at timestamptz;
  result jsonb;
  blocked boolean;
  amendment vecta_audit.invoice_amendments%rowtype;
begin
  insert into public.jobs(id,registration,booking_date,work_required,amount_quoted,customer_note,status,completed_at)
  values(job_id,'AMENDMENT-TEST','2099-01-01','Original service',250,'','completed','2099-01-01T10:00:00Z');
  select jsonb_build_object('version',1,'captured_at',now(),'rows',jsonb_build_array(
    jsonb_build_object('job',to_jsonb(j),'date','2099-01-01','amount',250,'customer','NMUK')),
    'invoice_lines',lines,'subtotal',250,'total',300)
  into snapshot from public.jobs j where id=job_id;
  insert into public.invoices(id,invoice_number,fleet_customer,fleet_month,fleet_job_ids,
    fleet_job_snapshot,lines,subtotal,vat,total,status)
  values(invoice_id,'AMENDMENT-TEST-'||invoice_id::text,'NMUK','2099-01',jsonb_build_array(job_id::text),
    snapshot,lines,250,50,300,'saved') returning updated_at into expected_updated_at;
  update public.workshop_settings set value=jsonb_set(value,'{nmukPreviewDrafts}',
    coalesce(value->'nmukPreviewDrafts','{}'::jsonb)||jsonb_build_object('2099-01',monthly)) where id='main';
  -- A later job edit must never be silently pulled into the issued invoice.
  update public.jobs set amount_quoted=295,work_required='Later changed service' where id=job_id;

  blocked:=false;
  begin
    update public.invoices set fleet_job_snapshot='{}' where id=invoice_id;
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: ordinary snapshot overwrite was allowed'; end if;
  blocked:=false;
  begin
    perform vecta_audit.restore_nmuk_invoice_monthly_charges(invoice_id,expected_updated_at-interval '1 second',monthly,400,'Test restoration',amendment_request);
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: stale invoice amendment was allowed'; end if;
  blocked:=false;
  begin
    perform vecta_audit.restore_nmuk_invoice_monthly_charges(invoice_id,expected_updated_at,monthly,445,'Test restoration',amendment_request);
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: latest job price was allowed into expected total'; end if;
  blocked:=false;
  begin
    perform vecta_audit.restore_nmuk_invoice_monthly_charges(invoice_id,expected_updated_at,
      jsonb_set(monthly,'{0,amount}','101'),401,'Test restoration',amendment_request);
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: unsaved monthly changes were allowed'; end if;
  blocked:=false;
  begin
    update public.invoices set status='paid' where id=invoice_id;
    perform vecta_audit.restore_nmuk_invoice_monthly_charges(invoice_id,now(),monthly,400,'Test restoration',amendment_request);
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: paid invoice amendment was allowed'; end if;

  result:=vecta_audit.restore_nmuk_invoice_monthly_charges(invoice_id,expected_updated_at,monthly,400,'Test restoration',amendment_request);
  if (result->>'subtotal')::numeric<>400 or (result->>'vat')::numeric<>80 or (result->>'total')::numeric<>480 then
    raise exception 'FAIL: amended invoice totals incorrect: %',result;
  end if;
  if (select fleet_job_snapshot->'rows' from public.invoices where id=invoice_id) is distinct from snapshot->'rows' then
    raise exception 'FAIL: original job evidence changed';
  end if;
  if (select value->'invoice'->>'subtotal' from public.workshop_settings where id='invoice_protected:'||invoice_id::text)<>'400' then
    raise exception 'FAIL: protected invoice did not reconcile';
  end if;
  select * into amendment from vecta_audit.invoice_amendments a where a.request_id=amendment_request;

  if amendment.original_invoice->'fleet_job_snapshot' is distinct from snapshot
     or (amendment.original_invoice->>'subtotal')::numeric<>250
     or (amendment.revised_invoice->>'subtotal')::numeric<>400 then
    raise exception 'FAIL: amendment did not preserve the original and revised invoice';
  end if;
  result:=vecta_audit.restore_nmuk_invoice_monthly_charges(invoice_id,expected_updated_at,monthly,400,'Test restoration',amendment_request);
  if result->>'already_applied'<>'true' then raise exception 'FAIL: retry was not idempotent'; end if;
  blocked:=false;
  begin
    perform vecta_audit.restore_nmuk_invoice_monthly_charges(invoice_id,expected_updated_at,monthly,400,'Changed request',amendment_request);
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: conflicting retry was allowed'; end if;
  blocked:=false;
  begin
    update public.invoices set fleet_job_snapshot=snapshot where id=invoice_id;
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: a stale client could restore the old snapshot'; end if;
  blocked:=false;
  begin
    update vecta_audit.invoice_amendments set reason='Overwrite history' where request_id=amendment_request;
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: amendment history was mutable'; end if;
  blocked:=false;
  begin
    delete from vecta_audit.invoice_amendments where request_id=amendment_request;
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: amendment history could be deleted'; end if;
  if has_function_privilege('anon','vecta_audit.restore_nmuk_invoice_monthly_charges(uuid,timestamptz,jsonb,numeric,text,text)','EXECUTE')
     or has_function_privilege('authenticated','vecta_audit.restore_nmuk_invoice_monthly_charges(uuid,timestamptz,jsonb,numeric,text,text)','EXECUTE')
     or has_function_privilege('service_role','vecta_audit.restore_nmuk_invoice_monthly_charges(uuid,timestamptz,jsonb,numeric,text,text)','EXECUTE') then
    raise exception 'FAIL: administrative amendment function is exposed';
  end if;
  if has_table_privilege('authenticated','vecta_audit.invoice_amendments','INSERT')
     or has_table_privilege('service_role','vecta_audit.invoice_amendments','INSERT') then
    raise exception 'FAIL: ordinary clients can authorise amendments';
  end if;
  -- Ordinary address saves still work and do not affect the amended financial evidence.
  update public.invoices set customer_address='Updated address' where id=invoice_id;
  if (select subtotal from public.invoices where id=invoice_id)<>400 then
    raise exception 'FAIL: address save changed amendment total';
  end if;
end;
$$;
