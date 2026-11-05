-- Isolated Test database only; every fixture is rolled back.
begin;
set local role service_role;
do $$
declare
 jid uuid:='00000000-0000-4000-8000-000000000d91';
 v jsonb:=jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e91','reference','99990991','registration','QZ91ZZZ','date','2099-10-29','time','12:15','state','confirmed','received_at',now(),'forwarded',true,'forwarded_id','already-sent');
 r jsonb; snapshot jsonb;
begin
 -- Receive first, then enter the service/MOT card in Workshop Pro.
 r:=public.vecta_apply_mot_confirmation(v);
 assert r->>'allocation_status'='no_unallocated_mot',r::text;
 insert into public.jobs(id,registration,job_type,technician,booking_date,drop_time,estimated_hours,status,customer_note)
 values(jid,'QZ91 ZZZ','Full Service || MOT','Alfie','2099-10-29','08:00',1,'booked','Keep service notes [[MOT_TIME:12:15]]');
 select to_jsonb(j) into snapshot from public.jobs j where id=jid;
 -- A concurrent edit after API preflight must make the atomic check refuse.
 update public.jobs set customer_note='[[MOT_TIME:12:30]]' where id=jid;
 assert public.vecta_recheck_mot_confirmation(jid,v) is null;
 update public.jobs set customer_note=snapshot->>'customer_note',booking_date='2099-10-30' where id=jid;
 assert public.vecta_recheck_mot_confirmation(jid,v) is null;
 update public.jobs set booking_date='2099-10-29',status='provisional' where id=jid;
 assert public.vecta_recheck_mot_confirmation(jid,v) is null;
 update public.jobs set status='booked' where id=jid;
 assert public.vecta_recheck_mot_confirmation(jid,v||'{"state":"review"}'::jsonb) is null;
 assert public.vecta_recheck_mot_confirmation(jid,v||'{"reference":"111"}'::jsonb) is null;
 -- Same allocation logic confirms in place, preserving the service and notes.
 r:=public.vecta_recheck_mot_confirmation(jid,v);
 assert r->>'state'='confirmed' and r->>'allocation_status'='allocated' and r->>'job_id'=jid::text,r::text;
 assert r->>'confirmation_mode'='existing_appointment' and r->>'forwarded'='true',r::text;
 assert (select to_jsonb(j)=snapshot from public.jobs j where id=jid),'Service card changed';
 assert public.vecta_recheck_mot_confirmation(jid,v)=r,'Retry is not idempotent';

 -- Unallocated later card follows the same existing Chris-allocation rules.
 v:=v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e92','reference','99990992','registration','QZ92ZZZ','time','15:15');
 r:=public.vecta_apply_mot_confirmation(v);
 assert r->>'allocation_status'='no_unallocated_mot',r::text;
 insert into public.jobs(id,registration,job_type,technician,booking_date,drop_time,estimated_hours,status,customer_note)
 values('00000000-0000-4000-8000-000000000d92','QZ92 ZZZ','MOT','Unallocated','2099-10-29','08:00',1,'booked','[[MOT_TIME:15:15]]');
 r:=public.vecta_recheck_mot_confirmation('00000000-0000-4000-8000-000000000d92',v);
 assert r->>'allocation_status'='allocated',r::text;
 assert (select technician='Chris' and drop_time='15:15'::time from public.jobs where id='00000000-0000-4000-8000-000000000d92');

 -- Cancellation arriving after the early email prevents later confirmation.
 v:=v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e93','reference','99990993','registration','QZ93ZZZ','time','13:15');
 perform public.vecta_apply_mot_confirmation(v);
 perform public.vecta_apply_mot_confirmation(v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e94','state','review','received_at',now()+interval '1 second'));
 insert into public.jobs(id,registration,job_type,technician,booking_date,drop_time,estimated_hours,status,customer_note)
 values('00000000-0000-4000-8000-000000000d93','QZ93 ZZZ','MOT','Chris','2099-10-29','13:15',1,'booked','[[MOT_TIME:13:15]]');
 r:=public.vecta_recheck_mot_confirmation('00000000-0000-4000-8000-000000000d93',v);
 assert r->>'allocation_status'='superseded',r::text;

 -- Two matching cards remain review-only until ambiguity is resolved.
 v:=v||jsonb_build_object('email_id','00000000-0000-4000-8000-000000000e95','reference','99990995','registration','QZ95ZZZ');
 perform public.vecta_apply_mot_confirmation(v);
 insert into public.jobs(id,registration,job_type,technician,booking_date,drop_time,estimated_hours,status,customer_note)
 values('00000000-0000-4000-8000-000000000d95','QZ95 ZZZ','MOT','Alfie','2099-10-29','08:00',1,'booked','[[MOT_TIME:13:15]]'),
 ('00000000-0000-4000-8000-000000000d96','QZ95 ZZZ','MOT','Chris','2099-10-29','13:15',1,'booked','[[MOT_TIME:13:15]]');
 r:=public.vecta_recheck_mot_confirmation('00000000-0000-4000-8000-000000000d95',v);
 assert r->>'allocation_status'='multiple_unallocated_mots',r::text;
 update public.jobs set status='cancelled' where id='00000000-0000-4000-8000-000000000d96';
 r:=public.vecta_recheck_mot_confirmation('00000000-0000-4000-8000-000000000d95',v);
 assert r->>'allocation_status'='allocated',r::text;
end;$$;
reset role;
select 'Earlier MOT confirmation assertions passed; fixtures rolled back' as result,
 has_function_privilege('authenticated','public.vecta_recheck_mot_confirmation(uuid,jsonb)','execute') as authenticated_can_execute,
 has_function_privilege('anon','public.vecta_recheck_mot_confirmation(uuid,jsonb)','execute') as anon_can_execute;
rollback;
