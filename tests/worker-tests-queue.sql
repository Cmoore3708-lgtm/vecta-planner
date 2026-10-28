-- Isolated Test only. All sample runs, receipts and worker heartbeats roll back.
begin;
do $$
declare a jsonb; b jsonb; job jsonb; rid uuid; prior_lease uuid;
begin
 if exists(select 1 from public.worker_test_runs where status in ('RUNNING','PAUSED')) then raise exception 'Refuse to interfere with a real test run';end if;
 if has_function_privilege('anon','public.worker_test_queue(text,jsonb)','execute') or has_table_privilege('authenticated','public.worker_test_cases','select') then raise exception 'Diagnostic data must be private';end if;
 select public.worker_test_queue('preflight','{}') into a;
 if a->>'status'<>'WORKER_OFFLINE' then raise exception 'New queue must not pretend worker is connected: %',a;end if;
 perform public.worker_test_queue('heartbeat','{"workerId":"12345678-1234-4234-8234-123456789abc","build":"gsf-diagnostics-v1","revision":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","ready":true}');
 select public.worker_test_queue('start','{"launchKey":"00000000-0000-4000-8000-000000000001","cohort":[{"registration":"G4WPC","fuelType":"Diesel"},{"registration":"XJ07WAL","fuelType":"Diesel"}]}') into a;
 rid=(a->>'id')::uuid;
 if a->>'status'<>'RUNNING' or rid is null then raise exception 'Start failed: %',a;end if;
 select public.worker_test_queue('start','{"launchKey":"00000000-0000-4000-8000-000000000001","cohort":[]}') into b;
 if b->>'id'<>a->>'id' or (select count(*) from public.worker_test_cases where run_id=rid)<>12 then raise exception 'Double start duplicated work';end if;
 select public.worker_test_queue('pull','{"workerId":"12345678-1234-4234-8234-123456789abc"}') into job;
 prior_lease=(job->>'lease')::uuid;
 if job->>'status'<>'JOB' then raise exception 'Pull failed: %',job;end if;
 select public.worker_test_queue('pull','{"workerId":"12345678-1234-4234-8234-123456789abc"}') into b;
 if b->>'status'<>'IDLE' then raise exception 'Concurrent case leased';end if;
 perform public.worker_test_queue('complete',jsonb_build_object('id',job->>'id','lease',job->>'lease','outcome','PAUSED','reason','LOGIN_REQUIRED','evidence',jsonb_build_object('stage','SUPPLIER_LOGIN'),'durationMs',12));
 if (select status from public.worker_test_runs where id=rid)<>'PAUSED' or (select attempts from public.worker_test_cases where id=(job->>'id')::uuid)<>0 then raise exception 'Login expiry not paused correctly';end if;
 perform public.worker_test_queue('resume',jsonb_build_object('id',rid));
 select public.worker_test_queue('pull','{"workerId":"12345678-1234-4234-8234-123456789abc"}') into job;
 if (job->>'lease')::uuid=prior_lease then raise exception 'Resumed case reused stale lease';end if;
 select public.worker_test_queue('complete',jsonb_build_object('id',job->>'id','lease',prior_lease,'outcome','PASSED','reason','OLD','durationMs',0)) into b;
 if b->>'status'<>'EXPIRED' then raise exception 'Stale lease accepted';end if;
 perform public.worker_test_queue('complete',jsonb_build_object('id',job->>'id','lease',job->>'lease','outcome','PASSED','reason','SUPPLIER_CHECKS_PASSED','evidence','{}'::jsonb,'durationMs',12));
 -- Lost acknowledgement is idempotent.
 select public.worker_test_queue('complete',jsonb_build_object('id',job->>'id','lease',job->>'lease','outcome','PASSED','reason','SUPPLIER_CHECKS_PASSED','evidence','{}'::jsonb,'durationMs',12)) into b;
 if b->>'status'<>'SAVED' then raise exception 'Receipt not idempotent';end if;
 select public.worker_test_queue('pull','{"workerId":"12345678-1234-4234-8234-123456789abc"}') into job;
 if job->'request'->>'operation'<>'oil_filter' then raise exception 'Completed service case repeated';end if;
 -- Network errors have one retry, then a failure and progress to next category.
 perform public.worker_test_queue('complete',jsonb_build_object('id',job->>'id','lease',job->>'lease','outcome','FAILED','reason','NETWORK_ERROR','evidence','{}'::jsonb,'durationMs',12));
 select public.worker_test_queue('pull','{"workerId":"12345678-1234-4234-8234-123456789abc"}') into job;
 if job->>'attempt'<>'2' then raise exception 'Retry count not retained';end if;
 perform public.worker_test_queue('complete',jsonb_build_object('id',job->>'id','lease',job->>'lease','outcome','FAILED','reason','NETWORK_ERROR','evidence','{}'::jsonb,'durationMs',12));
 select public.worker_test_queue('pull','{"workerId":"12345678-1234-4234-8234-123456789abc"}') into job;
 if job->'request'->>'operation'<>'air_filter' then raise exception 'Failure blocked following category';end if;
 update public.worker_test_cases set lease_until=now()-interval '1 second' where id=(job->>'id')::uuid;
 select public.worker_test_queue('pull','{"workerId":"12345678-1234-4234-8234-123456789abc"}') into b;
 if b->>'id'<>job->>'id' or b->>'lease'=job->>'lease' then raise exception 'Interrupted case not resumable';end if;
 perform public.worker_test_queue('cancel',jsonb_build_object('id',rid));
 select public.worker_test_queue('complete',jsonb_build_object('id',b->>'id','lease',b->>'lease','outcome','PASSED','reason','LATE','durationMs',12)) into a;
 if a->>'status'<>'EXPIRED' then raise exception 'Cancelled case accepted late result';end if;
 select public.worker_test_queue('status',jsonb_build_object('id',rid)) into a;
 if a->>'status'<>'CANCELLED' or jsonb_array_length(a->'cases')<>12 then raise exception 'Partial report lost';end if;
 if (a->'run') ? 'launch_key' then raise exception 'Launch key leaked in report';end if;
end $$;
rollback;
