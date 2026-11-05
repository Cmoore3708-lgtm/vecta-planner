-- Run after the migration against isolated Test only; test data rolls back.
begin;
set local role service_role;
do $$
declare d date:=date '2050-01-04';rid uuid:=gen_random_uuid();jid uuid;r public.website_booking_requests;j public.jobs;i integer;rid2 uuid;
begin
 assert not exists(select 1 from public.jobs where booking_date between d and d+20), 'Test dates must be empty';
 assert (public.vecta_online_booking_slot(d,'["Full Service","MOT"]')->>'hours')::numeric=1;
 insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,mileage,work_required,preferred_date_1,confirmed_date,confirmed_time,job_types,gsf_parts)
 values(rid,'Test only','test@example.invalid','00000000000','TESTONLY','Test car','45000','Full service & MOT',d,d,'08:00','["Full Service","MOT"]',
 '[{"id":"test-filter","description":"Oil filter £ test","quantity":1,"cost_price":5}]');
 select * into strict r from public.website_booking_requests where id=rid;
 assert r.status='awaiting_review' and r.reserved_hours=1 and r.confirmed_at is null and r.job_id is not null;
 jid:=r.job_id; select * into strict j from public.jobs where id=jid;
 assert j.status='provisional' and j.technician='Alfie' and j.drop_time=time '08:00' and j.estimated_hours=1 and not j.archived;
 assert j.work_required='Full service & MOT' and j.customer_email='test@example.invalid' and j.job_type='Full Service || MOT';
 assert position('[[JOB_PARTS_URI:' in j.customer_note)>0 and position('[[VECTA_WEB_DETAILS:' in j.customer_note)>0;
 -- The request and job count only once. A stale choice is rejected.
 assert public.vecta_online_booking_slot(d,'["Other"]')->>'time'='09:00';
 begin
  insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,work_required,preferred_date_1,confirmed_date,confirmed_time,job_types)
  values(gen_random_uuid(),'Test only','test@example.invalid','0000','TESTONLY','Test','Test',d,d,'08:00','["Other"]');
  raise exception 'Overlapping request accepted';
 exception when raise_exception then if sqlerrm not like 'VECTA_BOOKING_UNAVAILABLE:%' then raise;end if;end;
 -- Replayed submissions never make orphan jobs, even with changed date input.
 insert into public.website_booking_requests select (r).* on conflict(id) do nothing;
 r.preferred_date_1:=d+1;r.confirmed_date:=d+1;
 insert into public.website_booking_requests select (r).* on conflict(id) do nothing;
 assert (select count(*) from public.jobs where customer_email='test@example.invalid')=1;
 update public.website_booking_requests set status='contacted' where id=rid;
 update public.jobs set booking_date=d+1,drop_time='10:00',estimated_hours=2 where id=jid;
 select * into r from public.website_booking_requests where id=rid;
 assert r.status='contacted' and r.confirmed_date=d+1 and r.confirmed_time='10:00' and r.reserved_hours=2;
 assert public.vecta_online_booking_slot(d,'["Other"]')->>'time'='08:00';
 update public.jobs set status='booked' where id=jid;
 select * into r from public.website_booking_requests where id=rid;
 assert r.status='booked' and r.confirmed_at is not null and r.job_id=jid;
 assert (select count(*) from public.jobs where customer_email='test@example.invalid')=1;
 -- Deleting the inbox item cannot remove confirmed history.
 update public.website_booking_requests set status='deleted' where id=rid;
 assert (select status='booked' and not archived from public.jobs where id=jid);
 -- Six one-hour holds fill Tuesday's existing six-hour online limit.
 for i in 1..6 loop
  insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,work_required,preferred_date_1,job_types)
  values(gen_random_uuid(),'Test only','test@example.invalid','0000','TESTONLY','Test','Test',d+7,'["Full Service","MOT"]');
 end loop;
 assert public.vecta_online_booking_slot(d+7,'["Other"]') is null;
 select id,job_id into rid2,jid from public.website_booking_requests where preferred_date_1=d+7 order by confirmed_time limit 1;
 update public.jobs set archived=true where id=jid;
 assert (select status='cancelled' from public.website_booking_requests where id=rid2);
 assert public.vecta_online_booking_slot(d+7,'["Other"]')->>'time'='08:00';
 -- Inbox cancellation releases only its linked provisional job.
 select id,job_id into rid2,jid from public.website_booking_requests where preferred_date_1=d+7 and status='awaiting_review' order by confirmed_time limit 1;
 update public.website_booking_requests set status='archived' where id=rid2;
 assert (select archived and status='cancelled' from public.jobs where id=jid);
 -- The photo RPC uses the same atomic hold and preserves parts; failed photos roll back the job too.
 rid2:=gen_random_uuid();
 perform public.insert_website_booking_with_photos(jsonb_build_object('id',rid2,'customer_name','Test only','email','test@example.invalid','phone','0000','registration','TESTPHOTO','vehicle','Test','work_required','Test','preferred_date_1',d+14,'job_types','["Other"]'::jsonb,'source','Website booking','status','awaiting_review','created_at',now(),'gsf_parts','[{"id":"test","description":"Filter","cost_price":5}]'::jsonb),'["test-photo"]');
 select job_id into jid from public.website_booking_requests where id=rid2;
 assert jid is not null and (select count(*) from public.website_booking_photos where request_id=rid2)=1;
 assert (select position('[[JOB_PARTS_URI:' in customer_note)>0 from public.jobs where id=jid);
 rid2:=gen_random_uuid();
 begin
  perform public.insert_website_booking_with_photos(jsonb_build_object('id',rid2,'customer_name','Test only','email','test@example.invalid','phone','0000','registration','FAILPHOTO','vehicle','Test','work_required','Test','preferred_date_1',d+14,'job_types','["Other"]'::jsonb,'source','Website booking','status','awaiting_review','created_at',now()),jsonb_build_array(repeat('x',1200300)));
  raise exception 'Oversize photos were accepted';
 exception when check_violation then null;end;
 assert not exists(select 1 from public.website_booking_requests where id=rid2);
 assert not exists(select 1 from public.jobs where registration='FAILPHOTO');
 -- Friday retains its four-hour ceiling and Monday remains closed.
 for i in 1..4 loop
  insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,work_required,preferred_date_1,job_types)
  values(gen_random_uuid(),'Test only','test@example.invalid','0000','TESTONLY','Test','Test',d+3,'["Other"]');
 end loop;
 assert public.vecta_online_booking_slot(d+3,'["Other"]') is null;
 assert public.vecta_online_booking_slot(d+6,'["Other"]') is null;
 assert not has_function_privilege('anon','public.vecta_create_website_provisional()','execute');
end;$$;
rollback;
