-- Run only against isolated Test; all changes are rolled back.
begin;
do $$
declare d date:=date '2050-01-04';j uuid:=gen_random_uuid();r jsonb;id1 uuid:=gen_random_uuid();
begin
 -- Calendar notice uses the UK date, including the spring clock change.
 assert public.vecta_booking_earliest('["Brakes"]','2026-10-15 06:00Z')=date '2026-10-20';
 assert public.vecta_booking_earliest('["Brakes"]','2026-10-16 12:00Z')=date '2026-10-20';
 assert public.vecta_booking_earliest('["Brakes"]','2026-10-17 12:00Z')=date '2026-10-20';
 assert public.vecta_booking_earliest('["Full Service","MOT"]','2026-10-15 06:00Z')=date '2026-10-27';
 assert public.vecta_booking_earliest('["Brakes"]','2026-03-29 23:30Z')=date '2026-04-01';
 assert public.vecta_online_booking_slot('2026-10-19','["Other"]','2026-10-15 06:00Z') is null;
 assert public.vecta_online_booking_slot('2026-10-16','["Other"]','2026-10-15 06:00Z') is null;
 assert public.vecta_booking_earliest('["Tyres"]','2026-10-20 06:00Z')=date '2026-10-22';
 assert public.vecta_booking_earliest('["Tyres"]','2026-10-20 08:00Z')=date '2026-10-23';
 -- Tuesday's resulting load, not just its previous percentage, is bounded.
 assert extract(isodow from d)=2;
 insert into public.jobs(id,booking_date,registration,customer_name,work_required,status,technician,estimated_hours,drop_time,archived)
 values(j,d,'TESTONLY','Isolated test','Capacity','booked','Alfie',5.5,'08:00',false);
 assert public.vecta_online_booking_slot(d,'["Brakes"]','2026-10-15 06:00Z') is null;
 insert into public.jobs(id,booking_date,registration,customer_name,work_required,status,technician,estimated_hours,drop_time,archived) values(gen_random_uuid(),d+7,'TESTONLY','Isolated test','Capacity','booked','Alfie',4.5,'08:00',false);
 assert public.vecta_online_booking_slot(d+7,'["Brakes"]','2026-10-15 06:00Z') is not null;
 -- A pending request occupies its actual time on Tuesday, before acceptance.
 insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,work_required,preferred_date_1,confirmed_date,confirmed_time,job_types)
 values(id1,'Isolated test','test@example.invalid','00000000000','TESTONLY','Test','Capacity',d+14,d+14,'08:00','["Full Service"]');
 r:=public.vecta_online_booking_slot(d+14,'["Other"]','2026-10-15 06:00Z');
 assert r->>'time'='09:30';
 update public.website_booking_requests set status='contacted' where id=id1;
 assert public.vecta_online_booking_slot(d+14,'["Other"]','2026-10-15 06:00Z')->>'time'='09:30';
 begin
  insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,work_required,preferred_date_1,confirmed_date,confirmed_time,job_types)
  values(gen_random_uuid(),'Isolated test','test@example.invalid','00000000000','TESTONLY','Test','Capacity',d+14,d+14,'08:00','["Other"]');
  raise exception 'Overlapping request was accepted';
 exception when raise_exception then if sqlerrm not like 'VECTA_BOOKING_UNAVAILABLE:%' then raise;end if;end;
 -- Friday retains its four-hour limit and 14:30 finish.
 insert into public.jobs(id,booking_date,registration,customer_name,work_required,status,technician,estimated_hours,drop_time,archived)
 values(gen_random_uuid(),d+3,'TESTONLY','Isolated test','Capacity','booked','Alfie',3.5,'08:00',false);
 assert public.vecta_online_booking_slot(d+3,'["Other"]','2026-10-15 06:00Z') is null;
 insert into public.workshop_settings(id,value) values('main','{"mechanicTimeOff":[{"mechanic":"Alfie","start_date":"2050-01-14","end_date":"2050-01-14","start_time":"08:00","end_time":"13:30"}]}')
 on conflict(id) do update set value=excluded.value;
 assert public.vecta_online_booking_slot(d+10,'["Brakes"]','2026-10-15 06:00Z') is null;
 assert public.vecta_online_booking_slot(d+10,'["Other"]','2026-10-15 06:00Z')->>'time'='13:30';
 assert not has_function_privilege('anon','public.vecta_online_booking_availability(jsonb)','execute');
 assert not has_function_privilege('authenticated','public.vecta_export_workshop_backup()','execute');
end;$$;
rollback;
