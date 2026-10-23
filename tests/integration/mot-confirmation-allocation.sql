-- Run against the isolated Test database only. Every fixture is rolled back.
begin;
set local role service_role;
insert into public.jobs(id,registration,job_type,technician,booking_date,drop_time,estimated_hours,status,customer_note)
 values ('00000000-0000-4000-8000-000000000d01','QZ99 ZZZ','MOT || Brakes','Unallocated','2099-10-28','08:00',1,'booked','Keep customer notes [[MOT_TIME:09:00]]');
do $$
declare r jsonb; j public.jobs%rowtype; v jsonb:=jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e01','reference','99990001','registration','QZ99ZZZ','date','2099-10-29','time','12:15','state','confirmed','received_at',now(),'forwarded',false);
begin
 r:=public.vecta_apply_mot_confirmation(v);
 assert r->>'allocation_status'='allocated',r::text;
 select * into j from public.jobs where id='00000000-0000-4000-8000-000000000d01';
 assert j.technician='Chris' and j.booking_date='2099-10-29' and j.drop_time='12:15'::time;
 assert j.customer_note like '%Keep customer notes%' and j.customer_note like '%[[MOT_TIME:12:15]]%' and j.customer_note not like '%09:00%';
 -- Replayed events must not pull a manually moved job back into Chris's diary.
 update public.jobs set technician='Alfie' where id=j.id;
 r:=public.vecta_apply_mot_confirmation(v);
 assert (select technician='Alfie' from public.jobs where id=j.id);
 -- A fresh unallocated booking is not moved into a conflicting Chris slot.
 update public.jobs set technician='Unallocated',booking_date='2099-10-28',drop_time='08:00' where id=j.id;
 insert into public.jobs(id,registration,job_type,technician,booking_date,drop_time,estimated_hours,status)
 values('00000000-0000-4000-8000-000000000d02','QZ88 ZZZ','General','Chris','2099-10-29','12:00',1,'booked');
 v:=v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e02','reference','99990002');
 r:=public.vecta_apply_mot_confirmation(v);assert r->>'allocation_status'='chris_time_clash',r::text;
 assert (select technician='Unallocated' and booking_date='2099-10-28' from public.jobs where id=j.id);
 -- Adjacent jobs are allowed; the original duration and other work are retained.
 update public.jobs set drop_time='13:15' where id='00000000-0000-4000-8000-000000000d02';
 v:=v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e03','reference','99990003');
 r:=public.vecta_apply_mot_confirmation(v);assert r->>'allocation_status'='allocated',r::text;
 assert (select job_type='MOT || Brakes' and estimated_hours=1 from public.jobs where id=j.id);
 -- Multiple unallocated MOTs for the same registration are never guessed.
 update public.jobs set technician='Unallocated' where id=j.id;
 insert into public.jobs(id,registration,job_type,technician,booking_date,status)
 values('00000000-0000-4000-8000-000000000d03','QZ99 ZZZ','MOT','Unallocated','2099-10-30','booked');
 v:=v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e04','reference','99990004');
 r:=public.vecta_apply_mot_confirmation(v);assert r->>'allocation_status'='multiple_unallocated_mots',r::text;
 -- An older email cannot reallocate after a newer cancellation/review email.
 perform public.vecta_apply_mot_confirmation(v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e05','reference','99990005','state','review','received_at',now()+interval '1 second'));
 r:=public.vecta_apply_mot_confirmation(v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e06','reference','99990005'));
 assert r->>'allocation_status'='superseded',r::text;
 -- A time-off block has the same effect as an occupied diary slot.
 update public.jobs set status='quote' where id='00000000-0000-4000-8000-000000000d03';
 insert into public.workshop_settings(id,value,updated_at)
 values('main',jsonb_build_object('mechanicTimeOff',jsonb_build_array(jsonb_build_object('mechanic','Chris','start_date','2099-10-29','end_date','2099-10-29','start_time','12:00','end_time','13:00'))),now())
 on conflict(id) do update set value=jsonb_set(coalesce(public.workshop_settings.value,'{}'::jsonb),'{mechanicTimeOff}',excluded.value->'mechanicTimeOff');
 r:=public.vecta_apply_mot_confirmation(v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e08','reference','99990008'));
 assert r->>'allocation_status'='chris_time_off',r::text;
 -- Existing exact Chris allocations confirm without moving or duplicating jobs.
 update public.workshop_settings set value=jsonb_set(value,'{mechanicTimeOff}','[]'::jsonb) where id='main';
 update public.jobs set technician='Chris',booking_date='2099-10-29',drop_time='12:15',customer_note='Keep manual booking [[MOT_TIME:12:15]]' where id=j.id;
 r:=public.vecta_apply_mot_confirmation(v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e09','reference','99990009'));
 assert r->>'allocation_status'='allocated' and r->>'job_id'=j.id::text,r::text;
 assert (select technician='Chris' and drop_time='12:15'::time and customer_note like '%Keep manual booking%' from public.jobs where id=j.id);
 -- Different date/time or a conflicting MOT-time marker cannot be confirmed.
 r:=public.vecta_apply_mot_confirmation(v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e10','reference','99990010','time','14:00'));
 assert r->>'state'='review',r::text;
 update public.jobs set customer_note='[[MOT_TIME:14:00]]' where id=j.id;
 r:=public.vecta_apply_mot_confirmation(v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e11','reference','99990011'));
 assert r->>'state'='review',r::text;
 -- Unknown registrations never create a new job.
 r:=public.vecta_apply_mot_confirmation(v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e07','reference','99990007','registration','QZ77ZZZ'));
 assert r->>'allocation_status'='no_unallocated_mot',r::text;
 assert not exists(select 1 from public.jobs where registration='QZ77ZZZ');
end;$$;
reset role;
select 'MOT allocation SQL integration assertions passed; fixtures rolled back' as result,
 has_function_privilege('authenticated','public.vecta_apply_mot_confirmation(jsonb)','execute') as authenticated_can_execute,
 has_function_privilege('anon','public.vecta_apply_mot_confirmation(jsonb)','execute') as anon_can_execute;
rollback;
