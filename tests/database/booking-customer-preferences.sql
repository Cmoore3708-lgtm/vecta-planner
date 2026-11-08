-- Run only on isolated Test. Every fixture is rolled back.
begin;
set local role service_role;
do $$
declare rid uuid:=gen_random_uuid();jid uuid;r public.website_booking_requests;j public.jobs;hex text;decoded jsonb;pref jsonb:='{"version":1,"parts":"oem","serious_repairs":"book_later"}';
begin
 insert into public.website_booking_requests(id,customer_name,email,phone,registration,vehicle,work_required,preferred_date_1,job_types,customer_preferences)
 values(rid,'Preference fixture','preference-fixture@example.invalid','000','TESTPREF','Test vehicle','Test description',date '2050-02-01','["Other"]',pref);
 select * into strict r from public.website_booking_requests where id=rid;
 select * into strict j from public.jobs where id=r.job_id;
 assert r.customer_preferences=pref and j.status='provisional';
 hex:=replace(substring(j.customer_note from '\[\[VECTA_WEB_DETAILS:([^]]+)\]\]'),'%','');
 decoded:=convert_from(decode(hex,'hex'),'UTF8')::jsonb;
 assert decoded->'customer_preferences'=pref;
 update public.jobs set work_required='Edited by mechanic',status='booked' where id=j.id;
 assert (select customer_note=j.customer_note from public.jobs where id=j.id);
 rid:=gen_random_uuid();
 perform public.insert_website_booking_with_photos(jsonb_build_object('id',rid,'customer_name','Preference fixture','email','preference-fixture@example.invalid','phone','000','registration','TESTPREF','vehicle','Test vehicle','work_required','Photo test','preferred_date_1','2050-02-02','job_types','["Other"]'::jsonb,'source','Website booking','status','awaiting_review','created_at',now(),'customer_preferences',pref),'["test-photo"]');
 select * into strict r from public.website_booking_requests where id=rid;
 select * into strict j from public.jobs where id=r.job_id;
 assert r.customer_preferences=pref;
 assert (select count(*)=1 from public.website_booking_photos where request_id=rid);
 hex:=replace(substring(j.customer_note from '\[\[VECTA_WEB_DETAILS:([^]]+)\]\]'),'%','');
 decoded:=convert_from(decode(hex,'hex'),'UTF8')::jsonb;
 assert decoded->'customer_preferences'=pref;
end;$$;
rollback;
