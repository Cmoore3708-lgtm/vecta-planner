-- Run only in isolated Test. All fixture writes roll back; no supplier or email calls.
begin;
do $$
declare reply jsonb; active_reply jsonb; i integer; pending integer:=0; busy integer:=0;
 request jsonb; frozen jsonb; receipt_id uuid:=gen_random_uuid(); lease_id uuid;
begin
 if exists(select 1 from public.gsf_service_jobs where status in ('PENDING','WORKING') and deadline>now()) then
  raise exception 'Test queue must be idle';
 end if;
 update public.gsf_service_runtime set last_seen=now() where id=1;
 for i in 1..100 loop
  request:=jsonb_build_object('registration','ZZ'||lpad(i::text,3,'0')||'QA','service','Full Service','mileage',null,'range','Mid Range');
  reply:=public.gsf_service_queue('enqueue',jsonb_build_object('request',request,'actor',md5(i::text)||md5(i::text)));
  if reply->>'status'='PENDING' then pending:=pending+1;
  elsif reply->>'status'='BUSY' then busy:=busy+1;
  else raise exception 'Unexpected queue result: %',reply;end if;
 end loop;
 if pending<>3 or busy<>97 then raise exception 'Queue exceeded safe concurrency: % / %',pending,busy;end if;
 reply:=public.gsf_service_queue('pull','{}');
 if reply->>'status'<>'JOB' then raise exception 'No job leased';end if;
 if public.gsf_service_queue('pull','{}')->>'status'<>'IDLE' then raise exception 'Two workers claimed jobs simultaneously';end if;
 -- A valid in-flight job must not make the whole worker appear offline after 45s.
 update public.gsf_service_runtime set last_seen=now()-interval '60 seconds' where id=1;
 active_reply:=public.gsf_service_queue('enqueue',jsonb_build_object('request',jsonb_build_object('registration','ZZ999QA','service','Full Service','mileage',null,'range','Mid Range'),'actor',repeat('a',64)));
 if active_reply->>'status'<>'BUSY' then raise exception 'Working lease reported offline: %',active_reply;end if;
 update public.gsf_service_jobs set deadline=now()-interval '1 second' where status in ('PENDING','WORKING');
 if public.gsf_service_queue('enqueue',jsonb_build_object('request',request,'actor',repeat('a',64)))->>'status'<>'OFFLINE' then raise exception 'Disconnected worker not detected';end if;
 if has_function_privilege('anon','public.gsf_service_queue(text,jsonb)','execute') then raise exception 'Public queue access';end if;
 if has_table_privilege('anon','public.website_booking_receipts','select') or has_table_privilege('authenticated','public.website_booking_receipts','select') then raise exception 'Public receipt access';end if;

 -- Disposable receipt fixture: non-website source avoids reserving real capacity.
 insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,work_required,preferred_date_1,source,status)
 values(receipt_id,'Synthetic launch test','test@example.invalid','0000','ZZ00TEST','Synthetic vehicle','Synthetic work','2050-01-04','Synthetic test','awaiting_review');
 insert into public.website_booking_receipts(id,snapshot)
 values(receipt_id,jsonb_build_object('email','test@example.invalid','confirmed_date','2050-01-04'));
 reply:=public.vecta_booking_receipt('claim',receipt_id);
 if reply is null then raise exception 'Receipt unavailable';end if;
 lease_id:=(reply->>'lease')::uuid;
 if public.vecta_booking_receipt('claim',receipt_id) is not null then raise exception 'Receipt claimed twice';end if;
 frozen:='{"to":["test@example.invalid"],"text":"Frozen synthetic receipt"}'::jsonb;
 reply:=public.vecta_booking_receipt('prepare',receipt_id,lease_id,frozen);
 if reply->'payload'<>frozen then raise exception 'Payload not frozen';end if;
 reply:=public.vecta_booking_receipt('prepare',receipt_id,lease_id,'{"text":"changed"}'::jsonb);
 if reply->'payload'<>frozen then raise exception 'Payload changed on retry';end if;
 if (public.vecta_booking_receipt('sent',receipt_id,gen_random_uuid(),'{}')->>'saved')::boolean then raise exception 'Wrong lease marked sent';end if;
 perform public.vecta_booking_receipt('failed',receipt_id,lease_id,'{"error":"Synthetic timeout"}'::jsonb);
 update public.website_booking_receipts set first_attempt_at=now()-interval '24 hours',next_attempt_at=now() where id=receipt_id;
 if public.vecta_booking_receipt('claim',receipt_id) is not null then raise exception 'Unsafe retry after idempotency window';end if;
 if (select status from public.website_booking_receipts where id=receipt_id)<>'needs_review' then raise exception 'Missing delivery review flag';end if;
end;$$;
do $$
declare
  day date:=date '2050-02-01';
  fixture record;
  request_id uuid;
  hold_id uuid;
  hold public.jobs;
  queued jsonb;
begin
  if exists(select 1 from public.jobs where booking_date=day) then raise exception 'Synthetic test day must be empty'; end if;
  for fixture in select * from (values
    ('["Full Service","MOT"]'::jsonb,195::numeric,'inc_vat'),
    ('["MOT"]'::jsonb,65::numeric,'no_vat'),
    ('["Other"]'::jsonb,null::numeric,'inc_vat'),
    ('["Tyres"]'::jsonb,0::numeric,'inc_vat')
  ) as cases(types,price,vat) loop
    request_id:=gen_random_uuid();
    insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,job_types,work_required,preferred_date_1,approximate_cost)
    values(request_id,'Synthetic','fixture@example.invalid','0000','XX00TST','Test vehicle',fixture.types,'Test work',day,fixture.price);
    select job_id into strict hold_id from public.website_booking_requests where id=request_id and status='awaiting_review';
    select * into strict hold from public.jobs where id=hold_id;
    assert hold.status='provisional' and hold.estimated_hours=1;
    assert hold.amount_quoted is not distinct from fixture.price and hold.vat_mode=fixture.vat;
    select snapshot into strict queued from public.website_booking_receipts where id=request_id and status='pending';
    assert (queued->>'approximate_cost')::numeric is not distinct from fixture.price;
    -- Replaying the request cannot overwrite a workshop price edit or create another receipt/hold.
    update public.jobs set amount_quoted=111 where id=hold_id;
    insert into public.website_booking_requests select r.* from public.website_booking_requests r where r.id=request_id on conflict(id) do nothing;
    assert (select j.amount_quoted from public.jobs j where j.id=hold_id)=111;
    assert (select count(*) from public.jobs where position(request_id::text in customer_note)>0)=1;
    assert (select job_id from public.website_booking_requests where id=request_id)=hold_id;
    update public.jobs set status='booked' where id=hold_id;
    assert (select status from public.website_booking_requests where id=request_id)='booked';
  end loop;
end;$$;

rollback;
select 'PASS: 100 pricing requests bounded at three, one worker lease, offline recovery, receipt freeze and retry expiry, private access, provisional price and VAT, edit/retry/confirm' as result;
