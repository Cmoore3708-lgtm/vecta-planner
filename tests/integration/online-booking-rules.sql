begin; set local role service_role;
do $$
declare r public.website_booking_requests%rowtype;
begin
 if public.website_booking_duration_hours('["Oil & Filter Change","MOT"]'::jsonb)<>2 then raise exception 'Duration mismatch'; end if;
 if exists(select 1 from public.jobs where booking_date='2030-01-04' and technician='Alfie' and archived=false) or exists(select 1 from public.website_booking_requests where confirmed_date='2030-01-04' and status='awaiting_review') then raise exception 'Test date already occupied'; end if;
 r.id:=gen_random_uuid();r.customer_name:='CODEX CAPACITY RULE TEST';r.email:='capacity-test@example.invalid';r.phone:='00000000000';r.registration:='TEST';r.vehicle:='Test only';r.work_required:='No work required';r.source:='Website booking';r.status:='awaiting_review';r.created_at:=now();r.preferred_date_1:='2030-01-07';r.confirmed_date:='2030-01-07';r.job_types:='["MOT"]'::jsonb;
 begin
  insert into public.website_booking_requests select (r).*;
  raise exception 'Monday wrongly accepted';
 exception when raise_exception then if sqlerrm not like '%VECTA_BOOKING_MONDAY%' then raise; end if; end;
 r.preferred_date_1:='2030-01-04';r.confirmed_date:='2030-01-04';r.job_types:='["Full Service"]'::jsonb;
 insert into public.website_booking_requests select (r).*;
 r.id:=gen_random_uuid();r.job_types:='["Major Service"]'::jsonb;
 insert into public.website_booking_requests select (r).*;
 insert into public.website_booking_requests select (r).* on conflict(id) do nothing;
 r.id:=gen_random_uuid();r.job_types:='["MOT"]'::jsonb;
 begin
  insert into public.website_booking_requests select (r).*;
  raise exception 'Over-capacity Friday wrongly accepted';
 exception when raise_exception then if sqlerrm not like '%VECTA_BOOKING_FRIDAY_CAPACITY%' then raise; end if; end;
end $$;
rollback;
select 'passed: Monday rejected, exactly 4h accepted, over 4h rejected, replay allowed, test writes rolled back' as verification;