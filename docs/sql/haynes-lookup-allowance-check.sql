-- Run in a transaction and roll back; never send fixture plates to the PC.
DO $test$
DECLARE result jsonb; before_count integer; cached_registration text;
BEGIN
 update public.haynes_relay_worker set quota_day=(now() at time zone 'UTC')::date, quota_count=499, last_seen=now() where id=1;
 -- Existing live pending jobs are hidden only inside this rolled-back transaction.
 update public.haynes_relay_jobs set status='UNAVAILABLE',deadline=now()-interval '1 second' where status in ('PENDING','WORKING');
 delete from public.haynes_relay_jobs where registration in ('TEST500','TEST501','FAIL500');
 select public.haynes_relay('enqueue','{"registration":"TEST500"}') into result;
 if result->>'status' <> 'PENDING' then raise exception '500th request rejected: %',result; end if;
 select quota_count into before_count from public.haynes_relay_worker where id=1;
 if before_count <> 500 then raise exception 'Quota not incremented'; end if;
 select public.haynes_relay('enqueue','{"registration":"TEST500"}') into result;
 if result->>'status' <> 'PENDING' then raise exception 'Pending deduplication failed'; end if;
 select public.haynes_relay('enqueue','{"registration":"TEST501"}') into result;
 if result->>'status' <> 'DAILY_LIMIT' then raise exception '501st request accepted: %',result; end if;
 insert into public.haynes_relay_jobs(registration,status,completed_at) values ('FAIL500','UNAVAILABLE',now());
 select public.haynes_relay('enqueue','{"registration":"FAIL500"}') into result;
 if result->>'status' <> 'UNAVAILABLE' then raise exception 'Failed cooldown missing'; end if;
 if (select quota_count from public.haynes_relay_worker where id=1) <> 500 then raise exception 'Dedup/cooldown spent quota'; end if;
 select registration into cached_registration from public.haynes_relay_jobs where status='MATCHED' and completed_at>now()-interval '24 hours' limit 1;
 if cached_registration is not null then
   select public.haynes_relay('enqueue',jsonb_build_object('registration',cached_registration)) into result;
   if result->>'status'<>'MATCHED' then raise exception 'Cache blocked at quota'; end if;
 end if;
 update public.haynes_relay_worker set quota_day=(now() at time zone 'UTC')::date-1 where id=1;
 select public.haynes_relay('enqueue','{"registration":"TEST501"}') into result;
 if result->>'status'<>'PENDING' or (select quota_count from public.haynes_relay_worker where id=1)<>1 then raise exception 'Daily reset failed'; end if;
END $test$;
select 'quota, duplicate suppression, failed cooldown, cache and reset checks passed' as verification;
