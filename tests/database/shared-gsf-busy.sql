-- Run on a database containing the migration. All writes and RPCs in this test
-- target private temporary tables/functions and are discarded at rollback.
begin;
create temporary table gsf_service_jobs (like public.gsf_service_jobs including defaults);
create temporary table gsf_service_runtime (like public.gsf_service_runtime including defaults);
create temporary table vecta_repair_quote_jobs (like public.vecta_repair_quote_jobs including defaults);
create temporary table vecta_repair_quote_runtime (like public.vecta_repair_quote_runtime including defaults);
do $copy$
declare fn regprocedure;
begin
 foreach fn in array array['public.gsf_service_queue(text,jsonb)'::regprocedure,'public.vecta_repair_quote_queue(text,jsonb)'::regprocedure] loop
  execute replace(pg_get_functiondef(fn),'public.','pg_temp.');
 end loop;
end $copy$;
insert into pg_temp.gsf_service_runtime(id,last_seen,max_daily_jobs) values(1,now()-interval '1 minute',500);
insert into pg_temp.vecta_repair_quote_runtime(id,last_seen) values(1,now()-interval '1 minute');
do $tests$
declare
 service jsonb:=jsonb_build_object('actor',repeat('a',64),'request',jsonb_build_object('registration','TEST001','service','Interim Service','range','Mid Range'));
 repair jsonb:=jsonb_build_object('actor',repeat('a',64),'request',jsonb_build_object('registration','TEST002','operation','alternator-replacement','quantity',1));
begin
 if pg_temp.gsf_service_queue('enqueue',service)->>'status'<>'OFFLINE'
 or pg_temp.vecta_repair_quote_queue('enqueue',repair)->>'status'<>'OFFLINE' then raise exception 'A genuinely idle, disconnected worker must be offline';end if;
 insert into pg_temp.vecta_repair_quote_jobs(request,actor,status,lease,deadline) values(repair->'request',repair->>'actor','WORKING',gen_random_uuid(),now()+interval '90 seconds');
 if pg_temp.gsf_service_queue('enqueue',service)->>'status'<>'BUSY' then raise exception 'A repair lease must be visible to service';end if;
 insert into pg_temp.gsf_service_jobs(request,actor,status,deadline) values(service->'request',service->>'actor','PENDING',now()+interval '90 seconds');
 if pg_temp.gsf_service_queue('enqueue',service)->>'status'<>'PENDING' then raise exception 'Do not lose same-request deduplication';end if;
 delete from pg_temp.gsf_service_jobs;
 update pg_temp.vecta_repair_quote_jobs set deadline=now()-interval '1 second';
 if pg_temp.gsf_service_queue('enqueue',service)->>'status'<>'OFFLINE' then raise exception 'An expired sibling is not proof of activity';end if;
 delete from pg_temp.vecta_repair_quote_jobs;
 insert into pg_temp.gsf_service_jobs(request,actor,status,lease,deadline) values(service->'request',service->>'actor','WORKING',gen_random_uuid(),now()+interval '90 seconds');
 if pg_temp.vecta_repair_quote_queue('enqueue',repair)->>'status'<>'BUSY' then raise exception 'A service lease must be visible to repair';end if;
 insert into pg_temp.vecta_repair_quote_jobs(request,actor,status,completed_at,result) values(repair->'request',repair->>'actor','MATCHED',now(),'{}');
 if pg_temp.vecta_repair_quote_queue('enqueue',repair)->>'status'<>'MATCHED' then raise exception 'Cached quotes must win over sibling activity';end if;
 delete from pg_temp.vecta_repair_quote_jobs;
 update pg_temp.gsf_service_jobs set lease=null;
 if pg_temp.vecta_repair_quote_queue('enqueue',repair)->>'status'<>'OFFLINE' then raise exception 'A missing lease cannot keep the sibling active';end if;
 update pg_temp.vecta_repair_quote_runtime set last_seen=now();
 if pg_temp.vecta_repair_quote_queue('enqueue',repair)->>'status'<>'PENDING' then raise exception 'Healthy idle runner should accept the request';end if;
end $tests$;
rollback;
